# AI Writing Copilot Web UI

Frontend IDE cho tác giả viết truyện, duyệt Story Brain và làm việc với AI suggestions.

## Stack

- React 19 + Vite
- Tiptap rich-text editor
- Zustand state management
- Tailwind CSS
- React Flow
- Axios

## Chạy local

Yêu cầu Node.js tương thích với Vite 8.

```bash
npm install
npm run dev
```

Frontend mặc định chạy tại `http://localhost:5173` và hiện gọi AI service tại `http://localhost:8000` qua `src/services/api.js`.

## Cấu trúc chính

- `src/components/`: IDE, editor, AI panel, wiki, timeline và graph UI.
- `src/services/api.js`: HTTP client cho AI service.
- `src/store/useStore.js`: state của phiên viết và AI workflow.

Tài liệu sản phẩm, kiến trúc và UX chuẩn nằm tại [`../docs/README.md`](../docs/README.md).
