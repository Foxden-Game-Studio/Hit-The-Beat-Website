<?php
/* ==========================================================================
   save_feedback.php
   Receives feedback as JSON via POST, validates/sanitizes it, and appends
   it to feedbacks.json on the server.
   ========================================================================== */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Only accept POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// Read and decode JSON body
$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!$data || !is_array($data)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid JSON']);
    exit;
}

// --------------------------------------------------------------------------
// Validation & Sanitization
// (The JS already sanitizes for display; here we sanitize for safe storage.)
// --------------------------------------------------------------------------

$allowedCategories = ['general', 'hardware', 'player', 'bug', 'feature'];

$name     = isset($data['name'])     ? trim(strip_tags($data['name']))     : '';
$email    = isset($data['email'])    ? trim(strip_tags($data['email']))    : '';
$category = isset($data['category']) ? trim(strip_tags($data['category'])) : 'general';
$rating   = isset($data['rating'])   ? intval($data['rating'])             : 0;
$message  = isset($data['message'])  ? trim(strip_tags($data['message']))  : '';

// Field length limits
if (strlen($name) < 1 || strlen($name) > 100) {
    http_response_code(422);
    echo json_encode(['success' => false, 'error' => 'Invalid name']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 255) {
    http_response_code(422);
    echo json_encode(['success' => false, 'error' => 'Invalid email']);
    exit;
}

if (!in_array($category, $allowedCategories, true)) {
    $category = 'general';
}

if ($rating < 1 || $rating > 5) {
    http_response_code(422);
    echo json_encode(['success' => false, 'error' => 'Rating must be 1–5']);
    exit;
}

if (strlen($message) < 1 || strlen($message) > 2000) {
    http_response_code(422);
    echo json_encode(['success' => false, 'error' => 'Message must be 1–2000 characters']);
    exit;
}

// Build the sanitized feedback entry
$entry = [
    'name'      => $name,
    'email'     => $email,          // stored server-side only (not returned to other users)
    'category'  => $category,
    'rating'    => $rating,
    'message'   => $message,
    'timestamp' => date('c'),       // ISO 8601, server time
    'ip'        => $_SERVER['REMOTE_ADDR'] ?? 'unknown'   // for basic spam tracking
];

// --------------------------------------------------------------------------
// Persist to feedbacks.json
// --------------------------------------------------------------------------

$file = __DIR__ . '/feedbacks.json';

// Load existing entries (or start fresh)
$list = [];
if (file_exists($file)) {
    $existing = file_get_contents($file);
    $decoded  = json_decode($existing, true);
    if (is_array($decoded)) {
        $list = $decoded;
    }
}

// Prepend the new entry
array_unshift($list, $entry);

// Limit stored entries to 1000 to avoid unbounded growth
if (count($list) > 1000) {
    $list = array_slice($list, 0, 1000);
}

// Write back atomically via a temp file
$tmp = $file . '.tmp';
$ok  = file_put_contents($tmp, json_encode($list, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

if ($ok === false) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Could not write feedback file']);
    exit;
}

rename($tmp, $file);

// Return the sanitized entry (without email/ip) to the client for display
$public = $entry;
unset($public['email'], $public['ip']);

echo json_encode(['success' => true, 'feedback' => $public]);
