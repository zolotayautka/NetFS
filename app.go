package main

import (
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	mrand "math/rand"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

const (
	dataDir     = "./data"
	dbFile      = "./database.db"
	programName = "NetFS"
)

var db *gorm.DB

var progressChannels = struct {
	sync.RWMutex
	m map[string]chan int
}{m: make(map[string]chan int)}

type Node struct {
	ID        uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	Fid       *uint     `gorm:"uniqueIndex;check:((is_dir = true AND fid IS NULL) OR (is_dir = false AND fid IS NOT NULL))" json:"-"`
	Name      string    `gorm:"not null" json:"name"`
	IsDir     bool      `gorm:"not null" json:"is_dir"`
	OyaID     *uint     `gorm:"index" json:"oya_id,omitempty"`
	Ko        []Node    `gorm:"foreignKey:OyaID;references:ID;constraint:OnDelete:CASCADE" json:"ko,omitempty"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updated_at"`
	Size      int64     `gorm:"-" json:"size,omitempty"`
	Path      string    `gorm:"-" json:"path,omitempty"`
}

func (n Node) to_json() []byte {
	data, _ := json.Marshal(n)
	return data
}

func (n Node) return_file() []byte {
	if n.Fid == nil {
		return nil
	}
	p := dataDir + "/" + fmt.Sprintf("%d", *n.Fid)
	data, _ := os.ReadFile(p)
	return data
}

func return_root() Node {
	var root Node
	db.Preload("Ko").First(&root, "oya_id IS NULL")
	return root
}

func UploadFile(data []byte) (uint, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return 0, fmt.Errorf("cannot create data dir: %w", err)
	}
	r := mrand.New(mrand.NewSource(time.Now().UnixNano()))
	var filename uint
	for {
		filename = uint(r.Intn(100000000))
		filepath := fmt.Sprintf("%s/%d", dataDir, filename)
		file, err := os.OpenFile(filepath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
		if err != nil {
			if os.IsExist(err) {
				continue
			}
			return 0, fmt.Errorf("cannot create file: %w", err)
		}
		_, err = file.Write(data)
		file.Close()
		if err != nil {
			return 0, fmt.Errorf("cannot write file: %w", err)
		}
		break
	}
	return filename, nil
}

func UploadNode(filename string, data []byte, isDir bool, oyaID *uint) (uint, error) {
	var existing Node
	if err := db.First(&existing, "name = ? AND oya_id = ?", filename, oyaID).Error; err == nil {
		if isDir {
			if existing.IsDir {
				return existing.ID, nil
			}
			if err := DeleteNodeRecursive(existing.ID); err != nil {
				return 0, err
			}
			newNode := Node{
				Name:  filename,
				IsDir: true,
				OyaID: oyaID,
			}
			if res := db.Create(&newNode); res.Error != nil {
				return 0, res.Error
			}
			return newNode.ID, nil
		}
		if existing.IsDir {
			return 0, fmt.Errorf("folder_exists")
		}
		if !UpdateNode(existing.Fid, data) {
			return 0, fmt.Errorf("failed to update existing node")
		}
		existing.UpdatedAt = time.Now()
		if err := db.Save(&existing).Error; err != nil {
			return 0, fmt.Errorf("failed to update timestamp: %w", err)
		}
		return existing.ID, nil
	}
	if isDir {
		newNode := Node{
			Name:  filename,
			IsDir: true,
			OyaID: oyaID,
		}
		result := db.Create(&newNode)
		if result.Error != nil {
			return 0, result.Error
		}
		return newNode.ID, nil
	}
	fid, err := UploadFile(data)
	if err != nil {
		return 0, err
	}
	newNode := Node{
		Fid:   &fid,
		Name:  filename,
		IsDir: false,
		OyaID: oyaID,
	}
	result := db.Create(&newNode)
	if result.Error != nil {
		return 0, result.Error
	}
	return newNode.ID, nil
}

func UpdateNode(fid *uint, data []byte) bool {
	if fid == nil {
		return false
	}
	filepath := fmt.Sprintf("%s/%d", dataDir, *fid)
	file, err := os.OpenFile(filepath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return false
	}
	_, err = file.Write(data)
	_ = file.Close()
	return err == nil
}

func CopyNode(src Node, newOyaID uint) (uint, error) {
	if src.IsDir {
		newNode := Node{
			Name:  src.Name,
			IsDir: true,
			OyaID: &newOyaID,
		}
		if res := db.Create(&newNode); res.Error != nil {
			return 0, res.Error
		}
		var children []Node
		db.Where("oya_id = ?", src.ID).Find(&children)
		for _, c := range children {
			_, err := CopyNode(c, newNode.ID)
			if err != nil {
				fmt.Println("warning: copy child failed:", err)
			}
		}
		return newNode.ID, nil
	}
	fid, err := UploadFile(src.return_file())
	if err != nil {
		return 0, err
	}
	newNode := Node{
		Fid:   &fid,
		Name:  src.Name,
		IsDir: false,
		OyaID: &newOyaID,
	}
	result := db.Create(&newNode)
	if result.Error != nil {
		return 0, result.Error
	}
	return newNode.ID, nil
}

func findChildByName(oyaID uint, name string) (Node, bool) {
	var n Node
	if err := db.First(&n, "oya_id = ? AND name = ?", oyaID, name).Error; err != nil {
		return Node{}, false
	}
	return n, true
}

func isAncestor(ancestorID uint, nodeID uint) bool {
	var cur Node
	if err := db.First(&cur, nodeID).Error; err != nil {
		return false
	}
	for cur.OyaID != nil {
		if *cur.OyaID == ancestorID {
			return true
		}
		if err := db.First(&cur, *cur.OyaID).Error; err != nil {
			break
		}
	}
	return false
}

func DeleteNodeRecursive(id uint) error {
	var n Node
	if err := db.Preload("Ko").First(&n, id).Error; err != nil {
		return err
	}
	for _, c := range n.Ko {
		_ = DeleteNodeRecursive(c.ID)
	}
	if n.Fid != nil {
		p := fmt.Sprintf("%s/%d", dataDir, *n.Fid)
		_ = os.Remove(p)
	}
	result := db.Delete(&n)
	if result.Error != nil {
		return result.Error
	}
	return nil
}

func MoveNode(src Node, newOyaID uint) error {
	src.OyaID = &newOyaID
	result := db.Save(&src)
	return result.Error
}

func RenameNode(src Node, newName string) error {
	src.Name = newName
	result := db.Save(&src)
	return result.Error
}

func DeleteNode(src Node) error {
	result := db.Delete(&src)
	success := result.Error == nil && result.RowsAffected > 0
	if !success {
		return fmt.Errorf("delete failed")
	}
	fid := src.Fid
	if fid != nil {
		p := dataDir + "/" + fmt.Sprintf("%d", *fid)
		_ = os.Remove(p)
	}
	return nil
}

func GetJson(w http.ResponseWriter, r *http.Request) {
	idStr := r.URL.Path[len("/node/"):]
	var node Node
	if idStr == "" {
		node = return_root()
	} else {
		id, err := strconv.Atoi(idStr)
		if err != nil || id <= 0 {
			node = return_root()
		} else {
			db.Preload("Ko").First(&node, id)
		}
	}
	buildPath := func(n Node) string {
		if n.OyaID == nil {
			return "/"
		}
		parts := []string{n.Name}
		cur := n
		for cur.OyaID != nil {
			var parent Node
			if err := db.First(&parent, *cur.OyaID).Error; err != nil {
				break
			}
			if parent.OyaID == nil {
				break
			}
			parts = append([]string{parent.Name}, parts...)
			cur = parent
		}
		return "/" + strings.Join(parts, "/")
	}
	node.Path = buildPath(node)
	if node.Fid != nil {
		p := fmt.Sprintf("%s/%d", dataDir, *node.Fid)
		if st, err := os.Stat(p); err == nil {
			node.Size = st.Size()
		}
	}
	for i := range node.Ko {
		if node.Ko[i].Fid != nil {
			p := fmt.Sprintf("%s/%d", dataDir, *node.Ko[i].Fid)
			if st, err := os.Stat(p); err == nil {
				node.Ko[i].Size = st.Size()
			}
		}
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(node.to_json())
}

func GetFile(w http.ResponseWriter, r *http.Request) {
	idStr := strings.TrimPrefix(r.URL.Path, "/file/")
	id, _ := strconv.Atoi(idStr)
	var node Node
	db.First(&node, id)
	if node.Fid == nil {
		http.Error(w, "file not found", http.StatusNotFound)
		return
	}
	p := fmt.Sprintf("%s/%d", dataDir, *node.Fid)
	f, err := os.Open(p)
	if err != nil {
		http.Error(w, "failed to open file", http.StatusInternalServerError)
		return
	}
	defer f.Close()
	fi, err := f.Stat()
	if err != nil {
		http.Error(w, "failed to stat file", http.StatusInternalServerError)
		return
	}
	ext := strings.ToLower("." + strings.TrimPrefix(strings.TrimPrefix(filepath.Ext(node.Name), "."), "."))
	ctype := mime.TypeByExtension(ext)
	if ctype == "" {
		ctype = "application/octet-stream"
	}
	inline := r.URL.Query().Get("inline")
	if inline == "1" || inline == "true" {
		w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=\"%s\"", node.Name))
	} else {
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", node.Name))
	}
	w.Header().Set("Content-Type", ctype)
	http.ServeContent(w, r, node.Name, fi.ModTime(), f)
}

func UpFile(w http.ResponseWriter, r *http.Request) {
	contentType := r.Header.Get("Content-Type")
	var filename string
	var isDir bool
	var oyaPtr *uint
	var data []byte
	var uploadID string
	if strings.HasPrefix(contentType, "multipart/form-data") {
		err := r.ParseMultipartForm(1024 << 20) // 1024MB
		if err != nil {
			http.Error(w, "failed to parse multipart form: "+err.Error(), http.StatusBadRequest)
			return
		}
		filename = r.FormValue("filename")
		if filename == "" {
			if fh := r.MultipartForm.File["file"]; len(fh) > 0 && fh[0] != nil {
				filename = fh[0].Filename
			}
		}
		isDir = r.FormValue("is_dir") == "true" || r.FormValue("is_dir") == "1"
		oyaStr := r.FormValue("oya_id")
		if oyaStr != "" {
			if id, err := strconv.Atoi(oyaStr); err == nil {
				u := uint(id)
				oyaPtr = &u
			}
		}
		if !isDir {
			file, fh, err := r.FormFile("file")
			if err != nil {
				http.Error(w, "missing file: "+err.Error(), http.StatusBadRequest)
				return
			}
			defer file.Close()
			totalSize := int64(0)
			if fh != nil {
				totalSize = fh.Size
			}
			uploadID = r.FormValue("upload_id")
			if uploadID == "" {
				uploadID = r.URL.Query().Get("upload_id")
			}
			buf := make([]byte, 32*1024)
			var b []byte
			var readBytes int64
			for {
				n, err := file.Read(buf)
				if n > 0 {
					b = append(b, buf[:n]...)
					readBytes += int64(n)
					if uploadID != "" && totalSize > 0 {
						pct := int((readBytes * 100) / totalSize)
						progressChannels.RLock()
						ch, ok := progressChannels.m[uploadID]
						progressChannels.RUnlock()
						if ok {
							select {
							case ch <- pct:
							default:
							}
						}
					}
				}
				if err != nil {
					if err == io.EOF {
						break
					}
					http.Error(w, "failed to read file: "+err.Error(), http.StatusInternalServerError)
					return
				}
			}
			data = b
		}
	} else if strings.HasPrefix(contentType, "application/json") {
		var body struct {
			Filename   string `json:"filename"`
			IsDir      bool   `json:"is_dir"`
			OyaID      *uint  `json:"oya_id"`
			DataBase64 string `json:"data_base64"`
		}
		dec := json.NewDecoder(r.Body)
		if err := dec.Decode(&body); err != nil {
			http.Error(w, "failed to decode json: "+err.Error(), http.StatusBadRequest)
			return
		}
		filename = body.Filename
		isDir = body.IsDir
		oyaPtr = body.OyaID
		if !isDir && body.DataBase64 != "" {
			d, err := base64.StdEncoding.DecodeString(body.DataBase64)
			if err != nil {
				http.Error(w, "failed to decode base64: "+err.Error(), http.StatusBadRequest)
				return
			}
			data = d
		}
	} else {
		http.Error(w, "unsupported content type: "+contentType, http.StatusUnsupportedMediaType)
		return
	}
	if filename == "" {
		http.Error(w, "filename is required", http.StatusBadRequest)
		return
	}
	if oyaPtr == nil {
		root := return_root()
		oyaPtr = &root.ID
	}
	nodeID, err := UploadNode(filename, data, isDir, oyaPtr)
	if err != nil {
		if err.Error() == "folder_exists" {
			http.Error(w, "folder_exists", http.StatusConflict)
			return
		}
		http.Error(w, "upload_error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if uploadID != "" {
		progressChannels.RLock()
		ch, ok := progressChannels.m[uploadID]
		progressChannels.RUnlock()
		if ok {
			select {
			case ch <- 100:
			default:
			}
		}
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	resp := fmt.Sprintf(`{"success":true,"node_id":%d,"name":"%s"}`, nodeID, filename)
	_, _ = w.Write([]byte(resp))
}

func UploadProgressSSE(w http.ResponseWriter, r *http.Request) {
	uploadID := r.URL.Query().Get("upload_id")
	if uploadID == "" {
		http.Error(w, "upload_id query parameter is required", http.StatusBadRequest)
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	ch := make(chan int, 10)
	progressChannels.Lock()
	progressChannels.m[uploadID] = ch
	progressChannels.Unlock()
	defer func() {
		progressChannels.Lock()
		delete(progressChannels.m, uploadID)
		progressChannels.Unlock()
		close(ch)
	}()
	fmt.Fprintf(w, "data: %d\n\n", 0)
	flusher.Flush()
	for {
		select {
		case <-r.Context().Done():
			return
		case pct, ok := <-ch:
			if !ok {
				return
			}
			fmt.Fprintf(w, "data: %d\n\n", pct)
			flusher.Flush()
			if pct >= 100 {
				return
			}
		case <-time.After(30 * time.Second):
			fmt.Fprint(w, ": keepalive\n\n")
			flusher.Flush()
		}
	}
}

func CpFile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SrcID     uint `json:"src_id"`
		DstID     uint `json:"dst_id"`
		Overwrite bool `json:"overwrite"`
	}
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(&req); err != nil {
		http.Error(w, "invalid json: "+err.Error(), http.StatusBadRequest)
		return
	}
	if req.SrcID == 0 || req.DstID == 0 {
		http.Error(w, "src_id and dst_id required", http.StatusBadRequest)
		return
	}
	var src Node
	if err := db.First(&src, req.SrcID).Error; err != nil {
		http.Error(w, "source not found", http.StatusNotFound)
		return
	}
	if existing, ok := findChildByName(req.DstID, src.Name); ok {
		if !req.Overwrite {
			http.Error(w, "conflict: destination already contains an entry with same name", http.StatusConflict)
			return
		}
		if err := DeleteNodeRecursive(existing.ID); err != nil {
			http.Error(w, "failed to remove existing target: "+err.Error(), http.StatusInternalServerError)
			return
		}
	}
	_, err := CopyNode(src, req.DstID)
	if err != nil {
		http.Error(w, "copy failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(fmt.Sprintf(`{"success":true,"name":"%s"}`, src.Name)))
}

func MvFile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SrcID     uint `json:"src_id"`
		DstID     uint `json:"dst_id"`
		Overwrite bool `json:"overwrite"`
	}
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(&req); err != nil {
		http.Error(w, "invalid json: "+err.Error(), http.StatusBadRequest)
		return
	}
	if req.SrcID == 0 || req.DstID == 0 {
		http.Error(w, "src_id and dst_id required", http.StatusBadRequest)
		return
	}
	var src Node
	if err := db.First(&src, req.SrcID).Error; err != nil {
		http.Error(w, "source not found", http.StatusNotFound)
		return
	}
	if src.ID == req.DstID || isAncestor(src.ID, req.DstID) {
		http.Error(w, "cannot move into self or descendant", http.StatusBadRequest)
		return
	}
	if existing, ok := findChildByName(req.DstID, src.Name); ok {
		if !req.Overwrite {
			http.Error(w, "conflict: destination already contains an entry with same name", http.StatusConflict)
			return
		}
		if err := DeleteNodeRecursive(existing.ID); err != nil {
			http.Error(w, "failed to remove existing target: "+err.Error(), http.StatusInternalServerError)
			return
		}
	}
	if err := MoveNode(src, req.DstID); err != nil {
		http.Error(w, "move failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(fmt.Sprintf(`{"success":true,"name":"%s"}`, src.Name)))
}

func RnFile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SrcID   uint   `json:"src_id"`
		NewName string `json:"new_name"`
	}
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(&req); err != nil {
		http.Error(w, "invalid json: "+err.Error(), http.StatusBadRequest)
		return
	}
	if req.SrcID == 0 || strings.TrimSpace(req.NewName) == "" {
		http.Error(w, "src_id and new_name required", http.StatusBadRequest)
		return
	}
	var src Node
	if err := db.First(&src, req.SrcID).Error; err != nil {
		http.Error(w, "source not found", http.StatusNotFound)
		return
	}
	if err := RenameNode(src, req.NewName); err != nil {
		http.Error(w, "rename failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"success":true}`))
}

func DlFile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SrcID uint `json:"src_id"`
	}
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(&req); err != nil {
		http.Error(w, "invalid json: "+err.Error(), http.StatusBadRequest)
		return
	}
	if req.SrcID == 0 {
		http.Error(w, "src_id required", http.StatusBadRequest)
		return
	}
	var src Node
	if err := db.First(&src, req.SrcID).Error; err != nil {
		http.Error(w, "source not found", http.StatusNotFound)
		return
	}
	if err := DeleteNodeRecursive(src.ID); err != nil {
		http.Error(w, "delete failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"success":true}`))
}

//go:embed index.html
var indexHtmlContent string

//go:embed index.js
var js_script string

//go:embed i18n.js
var i18n_script string

func main() {
	var err error
	db, err = gorm.Open(sqlite.Open(dbFile), &gorm.Config{})
	if err != nil {
		panic(err)
	}
	db.AutoMigrate(&Node{})
	var root Node
	if err := db.First(&root, "oya_id IS NULL").Error; err != nil || root.ID == 0 {
		root = Node{
			Name:  "/",
			IsDir: true,
			OyaID: nil,
		}
		if res := db.Create(&root); res.Error != nil {
			fmt.Println("warning: failed to create root node:", res.Error)
		} else {
			fmt.Println("created root node id=", root.ID)
		}
	}
	http.HandleFunc("/file/", GetFile)
	http.HandleFunc("/node/", GetJson)
	http.HandleFunc("/upload", UpFile)
	http.HandleFunc("/upload/progress", UploadProgressSSE)
	http.HandleFunc("/copy", CpFile)
	http.HandleFunc("/move", MvFile)
	http.HandleFunc("/rename", RnFile)
	http.HandleFunc("/delete", DlFile)
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(indexHtmlContent))
	})
	http.HandleFunc("/index.js", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/javascript")
		w.Write([]byte(js_script))
	})
	http.HandleFunc("/i18n.js", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/javascript")
		w.Write([]byte(i18n_script))
	})
	fmt.Printf("%s server started at :8080\n", programName)
	http.ListenAndServe(":8080", nil)
}
