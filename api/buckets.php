<?php
require_once 'config.php';

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(["error" => "Not logged in"]);
    exit;
}

$method  = $_SERVER['REQUEST_METHOD'];
$data    = json_decode(file_get_contents("php://input"), true);
$user_id = $_SESSION['user_id'];

// ── GET — list all buckets ─────────────────────
if ($method === 'GET') {
    $stmt = $conn->prepare(
        "SELECT * FROM buckets WHERE user_id = ? ORDER BY created_at DESC"
    );
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    echo json_encode($rows);
}

// ── POST — create new bucket ───────────────────
if ($method === 'POST') {
    $name   = trim($data['bucket_name'] ?? '');
    $size   =      $data['size_gb']    ?? 25;
    $access =      $data['access_type'] ?? 'private';
    $region = trim($data['region']      ?? '');

    if (!$name) {
        echo json_encode(["error" => "Bucket name is required"]);
        exit;
    }

    if (!in_array($access, ['private', 'public'])) {
        $access = 'private';
    }

    $stmt = $conn->prepare(
        "INSERT INTO buckets (user_id, bucket_name, size_gb, access_type, region)
         VALUES (?, ?, ?, ?, ?)"
    );

    if (!$stmt) {
        echo json_encode(["error" => $conn->error]);
        exit;
    }

    $stmt->bind_param("siiss", $user_id, $name, $size, $access, $region);

    if ($stmt->execute()) {
        echo json_encode([
            "success" => true,
            "id"      => $conn->insert_id
        ]);
    } else {
        echo json_encode(["error" => $stmt->error]);
    }
}

// ── DELETE — remove bucket ─────────────────────
if ($method === 'DELETE') {
    $id = (int)($data['id'] ?? 0);

    if (!$id) {
        echo json_encode(["error" => "Invalid id"]);
        exit;
    }

    $stmt = $conn->prepare(
        "DELETE FROM buckets WHERE id = ? AND user_id = ?"
    );
    $stmt->bind_param("ii", $id, $user_id);
    $stmt->execute();
    echo json_encode(["success" => true]);
}