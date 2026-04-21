<?php
require_once 'config.php';

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    exit;
}

$user_id = $_SESSION['user_id'];
$id      = (int)($_GET['id'] ?? 0);
$preview = isset($_GET['preview']);

if (!$id) { http_response_code(400); exit; }

$stmt = $conn->prepare(
    "SELECT * FROM bucket_files WHERE id = ? AND user_id = ?"
);
$stmt->bind_param("ii", $id, $user_id);
$stmt->execute();
$file = $stmt->get_result()->fetch_assoc();

if (!$file) { http_response_code(404); exit; }

$filepath = __DIR__ . '/../uploads/' . $file['filename'];
if (!file_exists($filepath)) { http_response_code(404); exit; }

header('Content-Type: ' . $file['file_type']);
header('Content-Length: ' . filesize($filepath));

if ($preview) {
    // inline — browser renders it
    header('Content-Disposition: inline; filename="' . $file['original_name'] . '"');
} else {
    // force download
    header('Content-Disposition: attachment; filename="' . $file['original_name'] . '"');
}

readfile($filepath);
exit;