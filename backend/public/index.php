<?php
declare(strict_types=1);

use App\Http\Router;
use App\Http\Controllers\{ApartmentsController, BookingsController, CamerasController, ComplaintsController, MeetingsController, PdfController, VotesController, AuditController, AuthController, ContributionsController, DashboardController, FilesController, NotificationsController, PaymentsController, ProjectsController, ReportsController, ResidentsController, SettingsController};
use App\Support\{ApiError, Config, Http};

spl_autoload_register(static function (string $class): void {
    if (!str_starts_with($class, 'App\\')) return;
    $path = __DIR__ . '/../src/' . str_replace('\\', '/', substr($class, 4)) . '.php';
    if (is_file($path)) require_once $path;
});
// Support.php holds both Http and ApiError
require_once __DIR__ . '/../src/Support/Http.php';

Config::assertSafeStartup();
Http::cors();

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
// Strip any folder prefix so the API works at /api, /building29/api, or a vhost root.
$path = preg_replace('#^.*?/api#', '', $path) ?: '/';
$path = '/' . trim($path, '/');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$r = new Router();
$r->get('/health', static fn () => Http::json(['status' => 'ok', 'time' => date('c')]));

$r->post('/auth/login', [AuthController::class, 'login']);
$r->post('/auth/refresh', [AuthController::class, 'refresh']);
$r->post('/auth/logout', [AuthController::class, 'logout']);
$r->get('/auth/me', [AuthController::class, 'me']);
$r->post('/auth/change-password', [AuthController::class, 'changePassword']);

$r->get('/dashboard', [DashboardController::class, 'summary']);
$r->get('/settings', [SettingsController::class, 'show']);
$r->patch('/settings', [SettingsController::class, 'update']);

$r->get('/notifications', [NotificationsController::class, 'index']);
$r->get('/notifications/unread-count', [NotificationsController::class, 'unreadCount']);
$r->post('/notifications', [NotificationsController::class, 'store']);
$r->post('/notifications/read-all', [NotificationsController::class, 'markAllRead']);
$r->post('/notifications/{id}/read', [NotificationsController::class, 'markRead']);

$r->get('/audit-logs', [AuditController::class, 'index']);

$r->get('/apartments', [ApartmentsController::class, 'index']);
$r->get('/apartments/{id}', [ApartmentsController::class, 'show']);

$r->get('/residents', [ResidentsController::class, 'index']);
$r->post('/residents', [ResidentsController::class, 'store']);
$r->patch('/residents/{id}', [ResidentsController::class, 'update']);
$r->post('/residents/{id}/reset-password', [ResidentsController::class, 'resetPassword']);

$r->get('/projects', [ProjectsController::class, 'index']);
$r->post('/projects', [ProjectsController::class, 'store']);
$r->get('/projects/{id}', [ProjectsController::class, 'show']);
$r->patch('/projects/{id}', [ProjectsController::class, 'update']);
$r->post('/projects/{id}/lock', [ProjectsController::class, 'lock']);
$r->get('/projects/{id}/contributions', [ContributionsController::class, 'index']);
$r->patch('/projects/{id}/contributions/{apartmentId}', [ContributionsController::class, 'update']);



$r->get('/payments', [PaymentsController::class, 'index']);
$r->post('/payments', [PaymentsController::class, 'store']);
$r->post('/payments/{id}/reverse', [PaymentsController::class, 'reverse']);
$r->get('/payments/mine', [PaymentsController::class, 'mine']);
$r->get('/receipts/{no}', [PaymentsController::class, 'receipt']);

$r->get('/files', [FilesController::class, 'index']);
$r->post('/files', [FilesController::class, 'store']);
$r->get('/files/{id}/download', [FilesController::class, 'download']);
$r->delete('/files/{id}', [FilesController::class, 'destroy']);

$r->get('/reports/financial', [ReportsController::class, 'financial']);

// Server-generated PDFs (data comes only from MySQL)
$r->get('/pdf/receipts/{no}', [PdfController::class, 'receipt']);
$r->get('/pdf/reports/financial', [PdfController::class, 'financialReport']);

// Complaints
$r->get('/complaints', [ComplaintsController::class, 'index']);
$r->post('/complaints', [ComplaintsController::class, 'store']);
$r->get('/complaints/{id}', [ComplaintsController::class, 'show']);
$r->patch('/complaints/{id}', [ComplaintsController::class, 'update']);
$r->post('/complaints/{id}/notes', [ComplaintsController::class, 'addNote']);
$r->post('/complaints/{id}/attachments', [ComplaintsController::class, 'addAttachment']);
$r->get('/complaints/{id}/attachments/{fileId}/download', [ComplaintsController::class, 'downloadAttachment']);

// Votes
$r->get('/votes', [VotesController::class, 'index']);
$r->post('/votes', [VotesController::class, 'store']);
$r->get('/votes/{id}', [VotesController::class, 'show']);
$r->patch('/votes/{id}', [VotesController::class, 'update']);
$r->post('/votes/{id}/ballot', [VotesController::class, 'ballot']);

// Meetings
$r->get('/meetings', [MeetingsController::class, 'index']);
$r->post('/meetings', [MeetingsController::class, 'store']);
$r->get('/meetings/{id}', [MeetingsController::class, 'show']);
$r->patch('/meetings/{id}', [MeetingsController::class, 'update']);
$r->post('/meetings/{id}/attendance', [MeetingsController::class, 'attendance']);
$r->post('/meetings/{id}/documents', [MeetingsController::class, 'addDocument']);
$r->get('/meetings/{id}/documents/{fileId}/download', [MeetingsController::class, 'downloadDocument']);

// Facilities & bookings
$r->get('/facilities', [BookingsController::class, 'facilities']);
$r->post('/facilities', [BookingsController::class, 'storeFacility']);
$r->patch('/facilities/{id}', [BookingsController::class, 'updateFacility']);
$r->get('/facilities/{id}/availability', [BookingsController::class, 'availability']);
$r->get('/bookings', [BookingsController::class, 'index']);
$r->post('/bookings', [BookingsController::class, 'store']);
$r->patch('/bookings/{id}', [BookingsController::class, 'update']);

// Cameras (information register only)
$r->get('/cameras', [CamerasController::class, 'index']);
$r->post('/cameras', [CamerasController::class, 'store']);
$r->get('/cameras/{id}', [CamerasController::class, 'show']);
$r->patch('/cameras/{id}', [CamerasController::class, 'update']);
$r->delete('/cameras/{id}', [CamerasController::class, 'destroy']);



try {
    if (!$r->dispatch($method, $path)) {
        Http::error(404, 'not_found', 'Endpoint not found: ' . $method . ' ' . $path);
    }
} catch (ApiError $e) {
    Http::error($e->status, $e->errorCode, $e->getMessage(), $e->fields);
} catch (\Throwable $e) {
    // Full detail goes to the server log only. Clients never see SQL text,
    // stack traces or filesystem paths.
    error_log((string) $e);
    $safe = (!Config::isProduction() && Config::get('debug')) ? $e->getMessage() : 'Unexpected server error';
    Http::error(500, 'server_error', $safe);
}
