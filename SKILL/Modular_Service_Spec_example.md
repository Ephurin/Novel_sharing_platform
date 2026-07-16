# [TÊN SERVICE] SERVICE - SPECIFICATION

## 1. OVERVIEW & BUSINESS RULES (Tổng quan & Quy tắc nghiệp vụ)
*   **Mission:** Mô tả ngắn gọn vai trò của service trong hệ thống.
*   **Core Entities:** Các thực thể dữ liệu (bảng DB) mà service này chịu trách nhiệm quản lý trực tiếp (Database-per-service).
*   **Constraints & Security:** Các quy tắc ràng buộc nghiệp vụ cứng và bảo mật (ví dụ: mật khẩu phải mã hóa bcrypt, giao dịch phải là atomic).

## 2. SERVICE WORKFLOWS (Luồng hoạt động của dịch vụ)
*   Mô tả luồng đi của dữ liệu ở mức vĩ mô (vẽ bằng sơ đồ Mermaid: Sequence Diagram hoặc Flowchart).
*   Mô tả cách Service này tương tác với API Gateway, Client và các Service khác.
*   *Ví dụ:* Luồng trao đổi JWT (Auth Service), luồng thanh toán Coin (Payment Service).

## 3. DETAILED USE CASES (Đặc tả chức năng chi tiết)
*   Đặc tả chi tiết từng API/chức năng dưới dạng bảng Use Case chuẩn:
    *   **Objective** (Mục tiêu), **Actor** (Tác nhân), **Pre/Post-conditions** (Điều kiện trước/sau).
    *   **Basic Flow** (Luồng chuẩn) & **Exception Flow** (Luồng xử lý lỗi/ngoại lệ).
