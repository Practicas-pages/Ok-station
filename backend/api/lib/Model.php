<?php
/**
 * ORM-lite (estilo Active Record) sobre PDO. Sin dependencias.
 * Cada modelo declara su tabla; aquí viven las consultas comunes con
 * sentencias preparadas. Mapea 1:1 a Eloquent (Laravel) si se migra.
 * Requiere la función db() de _bootstrap.php.
 */
abstract class Model
{
    protected static $table;
    protected static $pk = 'id';

    public static function find($id): ?array {
        $st = db()->prepare('SELECT * FROM ' . static::$table . ' WHERE ' . static::$pk . ' = ? LIMIT 1');
        $st->execute([$id]);
        return $st->fetch() ?: null;
    }

    public static function findBy(string $col, $val): ?array {
        $st = db()->prepare('SELECT * FROM ' . static::$table . ' WHERE ' . $col . ' = ? LIMIT 1');
        $st->execute([$val]);
        return $st->fetch() ?: null;
    }

    public static function all(?string $orderBy = null): array {
        $sql = 'SELECT * FROM ' . static::$table;
        if ($orderBy) $sql .= ' ORDER BY ' . $orderBy;
        return db()->query($sql)->fetchAll();
    }

    public static function where(array $conds, ?string $orderBy = null): array {
        $w = []; $p = [];
        foreach ($conds as $k => $v) { $w[] = "$k = ?"; $p[] = $v; }
        $sql = 'SELECT * FROM ' . static::$table . ($w ? ' WHERE ' . implode(' AND ', $w) : '');
        if ($orderBy) $sql .= ' ORDER BY ' . $orderBy;
        $st = db()->prepare($sql);
        $st->execute($p);
        return $st->fetchAll();
    }

    public static function create(array $data): int {
        $cols = array_keys($data);
        $ph = array_fill(0, count($cols), '?');
        $st = db()->prepare('INSERT INTO ' . static::$table . ' (' . implode(',', $cols) . ') VALUES (' . implode(',', $ph) . ')');
        $st->execute(array_values($data));
        return (int) db()->lastInsertId();
    }

    public static function update($id, array $data): void {
        $set = []; $p = [];
        foreach ($data as $k => $v) { $set[] = "$k = ?"; $p[] = $v; }
        $p[] = $id;
        $st = db()->prepare('UPDATE ' . static::$table . ' SET ' . implode(',', $set) . ' WHERE ' . static::$pk . ' = ?');
        $st->execute($p);
    }

    public static function count(array $conds = []): int {
        $w = []; $p = [];
        foreach ($conds as $k => $v) { $w[] = "$k = ?"; $p[] = $v; }
        $sql = 'SELECT COUNT(*) c FROM ' . static::$table . ($w ? ' WHERE ' . implode(' AND ', $w) : '');
        $st = db()->prepare($sql);
        $st->execute($p);
        return (int) $st->fetch()['c'];
    }
}

/* ── Modelos con sus relaciones ── */
final class User extends Model {
    protected static $table = 'users';
    /** Relación users↔roles (M2M vía user_roles). */
    public static function roles(int $userId): array {
        $st = db()->prepare('SELECT r.slug FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?');
        $st->execute([$userId]);
        return array_column($st->fetchAll(), 'slug');
    }
    /** Permisos efectivos del usuario (roles→permissions). */
    public static function permissions(int $userId): array {
        $st = db()->prepare(
            'SELECT DISTINCT p.slug FROM permissions p
             JOIN role_permissions rp ON rp.permission_id = p.id
             JOIN user_roles ur ON ur.role_id = rp.role_id
             WHERE ur.user_id = ?'
        );
        $st->execute([$userId]);
        return array_column($st->fetchAll(), 'slug');
    }
}
final class Role    extends Model { protected static $table = 'roles'; }
final class Review  extends Model { protected static $table = 'reviews'; }
final class Service extends Model { protected static $table = 'services'; }
final class Category extends Model { protected static $table = 'categories'; }
final class UploadedFile extends Model { protected static $table = 'uploaded_files'; }
final class Notification extends Model { protected static $table = 'notifications'; }

final class Order extends Model {
    protected static $table = 'orders';
    /** Relación orders 1—M order_items (con datos del archivo). */
    public static function items(int $orderId): array {
        $st = db()->prepare(
            'SELECT oi.*, uf.original_name, uf.stored_path, uf.pages, uf.mime_type, uf.size_bytes
             FROM order_items oi
             LEFT JOIN uploaded_files uf ON uf.id = oi.uploaded_file_id
             WHERE oi.order_id = ? ORDER BY oi.id'
        );
        $st->execute([$orderId]);
        return $st->fetchAll();
    }
}

final class OrderItem extends Model { protected static $table = 'order_items'; }
