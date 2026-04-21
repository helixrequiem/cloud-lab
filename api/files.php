<?php
require_once 'config.php';

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(["error" => "Not logged in"]);
    exit;
}

$user_id = $_SESSION['user_id'];
$method  = $_SERVER['REQUEST_METHOD'];

// ── GET — list files in a bucket ──────────────
if ($method === 'GET') {
    $bucket_id = (int)($_GET['bucket_id'] ?? 0);
    if (!$bucket_id) {
        echo json_encode(["error" => "bucket_id required"]);
        exit;
    }
    $stmt = $conn->prepare(
        "SELECT * FROM bucket_files
         WHERE bucket_id = ? AND user_id = ?
         ORDER BY created_at DESC"
    );
    $stmt->bind_param("ii", $bucket_id, $user_id);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    echo json_encode($rows);
}

// ── POST — upload a file ───────────────────────
if ($method === 'POST') {
    $bucket_id = (int)($_POST['bucket_id'] ?? 0);
    if (!$bucket_id || !isset($_FILES['file'])) {
        echo json_encode(["error" => "bucket_id and file required"]);
        exit;
    }

    $file          = $_FILES['file'];
    $original_name = basename($file['name']);
    $file_size     = $file['size'];
    $file_type     = mime_content_type($file['tmp_name']);

    // Max 10MB
    if ($file_size > 10 * 1024 * 1024) {
        echo json_encode(["error" => "File too large. Max 10MB."]);
        exit;
    }

    // Safe unique filename
    $ext      = pathinfo($original_name, PATHINFO_EXTENSION);
    $filename = uniqid('file_') . '.' . $ext;
    $dest     = __DIR__ . '/../uploads/' . $filename;

    if (!move_uploaded_file($file['tmp_name'], $dest)) {
        echo json_encode(["error" => "Upload failed"]);
        exit;
    }

    $stmt = $conn->prepare(
        "INSERT INTO bucket_files
         (bucket_id, user_id, filename, original_name, file_size, file_type)
         VALUES (?, ?, ?, ?, ?, ?)"
    );
    $stmt->bind_param("iissis", $bucket_id, $user_id, $filename, $original_name, $file_size, $file_type);

    if ($stmt->execute()) {
        echo json_encode(["success" => true, "id" => $conn->insert_id]);
    } else {
        echo json_encode(["error" => $stmt->error]);
    }
}

// ── DELETE — remove a file ─────────────────────
if ($method === 'DELETE') {
    $data = json_decode(file_get_contents("php://input"), true);
    $id   = (int)($data['id'] ?? 0);
    if (!$id) { echo json_encode(["error" => "Invalid id"]); exit; }

    // Get filename first so we can delete the actual file
    $stmt = $conn->prepare(
        "SELECT filename FROM bucket_files WHERE id = ? AND user_id = ?"
    );
    $stmt->bind_param("ii", $id, $user_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();

    if (!$row) { echo json_encode(["error" => "File not found"]); exit; }

    // Delete physical file
    $filepath = __DIR__ . '/../uploads/' . $row['filename'];
    if (file_exists($filepath)) unlink($filepath);

    // Delete DB record
    $stmt = $conn->prepare(
        "DELETE FROM bucket_files WHERE id = ? AND user_id = ?"
    );
    $stmt->bind_param("ii", $id, $user_id);
    $stmt->execute();
    echo json_encode(["success" => true]);
}