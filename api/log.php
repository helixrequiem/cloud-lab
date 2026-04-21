<?php
require_once 'config.php';

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(["error" => "Not logged in"]);
    exit;
}

$method  = $_SERVER['REQUEST_METHOD'];
$user_id = $_SESSION['user_id'];

// ── GET — fetch activity log ───────────────────
if ($method === 'GET') {
    $stmt = $conn->prepare(
        "SELECT * FROM activity_log
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 50"
    );
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    echo json_encode($rows);
}

// ── POST — write a log entry ───────────────────
if ($method === 'POST') {
    $data    = json_decode(file_get_contents("php://input"), true);
    $action  = trim($data['action']  ?? '');
    $details = trim($data['details'] ?? '');

    if (!$action) {
        echo json_encode(["error" => "Action is required"]);
        exit;
    }

    $stmt = $conn->prepare(
        "INSERT INTO activity_log (user_id, action, details)
         VALUES (?, ?, ?)"
    );
    $stmt->bind_param("iss", $user_id, $action, $details);
    $stmt->execute();
    echo json_encode(["success" => true]);
}