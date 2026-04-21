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

// ── GET — list all instances ───────────────────
if ($method === 'GET') {
    $stmt = $conn->prepare(
        "SELECT id, name, cpu, ram, os, region, status, user_id, created_at
         FROM instances WHERE user_id = ? ORDER BY created_at DESC"
    );
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    echo json_encode($rows);
}

// ── POST — create new instance ─────────────────
if ($method === 'POST') {
    $name   = trim($data['name']   ?? '');
    $cpu    =      $data['cpu']    ?? 2;
    $ram    =      $data['ram']    ?? 4;
    $os     = trim($data['os']     ?? '');
    $region = trim($data['region'] ?? '');

    if (!$name) {
        echo json_encode(["error" => "Instance name is required"]);
        exit;
    }

    $stmt = $conn->prepare(
        "INSERT INTO instances (user_id, name, cpu, ram, os, region, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'running', NOW())"
    );

    if (!$stmt) {
        echo json_encode(["error" => $conn->error]);
        exit;
    }

    $stmt->bind_param("isiiss", $user_id, $name, $cpu, $ram, $os, $region);

    if ($stmt->execute()) {
        echo json_encode([
            "success" => true,
            "id"      => $conn->insert_id
        ]);
    } else {
        echo json_encode(["error" => $stmt->error]);
    }
}


// ── PUT — start or stop instance ──────────────
if ($method === 'PUT') {
    $id     = (int)($data['id']     ?? 0);
    $status =      $data['status'] ?? '';

    if (!$id || !in_array($status, ['running', 'stopped'])) {
        echo json_encode(["error" => "Invalid id or status"]);
        exit;
    }

    $stmt = $conn->prepare(
        "UPDATE instances SET status = ? WHERE id = ? AND user_id = ?"
    );
    $stmt->bind_param("sii", $status, $id, $user_id);
    $stmt->execute();
    echo json_encode(["success" => true]);
}

// ── DELETE — remove instance ───────────────────
if ($method === 'DELETE') {
    $id = (int)($data['id'] ?? 0);

    if (!$id) {
        echo json_encode(["error" => "Invalid id"]);
        exit;
    }

    $stmt = $conn->prepare(
        "DELETE FROM instances WHERE id = ? AND user_id = ?"
    );
    $stmt->bind_param("ii", $id, $user_id);
    $stmt->execute();
    echo json_encode(["success" => true]);
}
