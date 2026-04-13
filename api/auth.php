<?php
require_once 'config.php';

$data   = json_decode(file_get_contents("php://input"), true);
$action = $data['action'] ?? '';

// ── REGISTER ──────────────────────────────────
if ($action === 'register') {
    $name  = trim($data['name']     ?? '');
    $email = trim($data['email']    ?? '');
    $pass  =      $data['password'] ?? '';

    if (!$name || !$email || !$pass) {
        echo json_encode(["error" => "All fields are required"]);
        exit;
    }

    $hashed = password_hash($pass, PASSWORD_DEFAULT);
    $stmt   = $conn->prepare("INSERT INTO users (name, email, password) VALUES (?, ?, ?)");

    // Check prepare worked before continuing
    if (!$stmt) {
        echo json_encode(["error" => "Prepare failed: " . $conn->error]);
        exit;
    }

    $stmt->bind_param("sss", $name, $email, $hashed);

    if ($stmt->execute()) {
        echo json_encode(["success" => true, "message" => "Account created!"]);
    } else {
        echo json_encode(["error" => "Execute failed: " . $stmt->error]);
    }
}

// ── LOGIN ──────────────────────────────────────
if ($action === 'login') {
    $email = trim($data['email']    ?? '');
    $pass  =      $data['password'] ?? '';

    $stmt = $conn->prepare("SELECT * FROM users WHERE email = ?");

    if (!$stmt) {
        echo json_encode(["error" => "Prepare failed: " . $conn->error]);
        exit;
    }

    $stmt->bind_param("s", $email);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();

    if ($user && password_verify($pass, $user['password'])) {
        $_SESSION['user_id']   = $user['id'];
        $_SESSION['user_name'] = $user['name'];
        echo json_encode([
            "success" => true,
            "name"    => $user['name'],
            "id"      => $user['id']
        ]);
    } else {
        echo json_encode(["error" => "Wrong email or password"]);
    }
}

// ── LOGOUT ────────────────────────────────────
if ($action === 'logout') {
    session_destroy();
    echo json_encode(["success" => true]);
}