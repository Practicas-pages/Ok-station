<?php
/**
 * Libreta de direcciones del cliente (tabla user_addresses).
 * -----------------------------------------------------------------------------
 * Comparten esto los endpoints de shop/: validación y reglas de negocio en UN solo
 * lugar para que no se dupliquen ni se desincronicen.
 *
 * Regla clave: solo UNA dirección predeterminada por usuario. No se puede expresar
 * con un UNIQUE en MySQL (haría falta un índice parcial), así que se garantiza aquí,
 * dentro de una transacción.
 */
final class Addresses
{
    const MAX_POR_USUARIO = 10;   // tope sano: evita que una cuenta llene la tabla

    /** Estados de México. El estado decide el IVA (BC norte 8%, resto 16%). */
    const ESTADOS = [
        'Aguascalientes','Baja California','Baja California Sur','Campeche','Chiapas',
        'Chihuahua','Ciudad de México','Coahuila','Colima','Durango','Estado de México',
        'Guanajuato','Guerrero','Hidalgo','Jalisco','Michoacán','Morelos','Nayarit',
        'Nuevo León','Oaxaca','Puebla','Querétaro','Quintana Roo','San Luis Potosí',
        'Sinaloa','Sonora','Tabasco','Tamaulipas','Tlaxcala','Veracruz','Yucatán','Zacatecas',
    ];

    /** Direcciones del usuario, la predeterminada primero. */
    public static function listFor(PDO $pdo, int $userId): array
    {
        $st = $pdo->prepare(
            'SELECT id, recipient, phone, street, ext_num, int_num, neighborhood, city,
                    state, postal_code, notes, is_default
               FROM user_addresses WHERE user_id = ?
              ORDER BY is_default DESC, id DESC'
        );
        $st->execute([$userId]);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$r) {
            $r['id']         = (int) $r['id'];
            $r['is_default'] = (bool) $r['is_default'];
            $r['label']      = self::label($r);          // "Calle 5 #12, Centro, Tijuana 22000"
        }
        return $rows;
    }

    /** Etiqueta corta de una dirección, para listarla sin recomponerla en el front. */
    public static function label(array $a): string
    {
        $n = trim(($a['ext_num'] ?? '') . (!empty($a['int_num']) ? ' int. ' . $a['int_num'] : ''));
        return trim(($a['street'] ?? '') . ' #' . $n . ', ' . ($a['neighborhood'] ?? '') . ', '
                    . ($a['city'] ?? '') . ' ' . ($a['postal_code'] ?? ''));
    }

    /**
     * Valida los campos que manda el navegador. Devuelve [limpios, errorONull].
     * SIEMPRE en el servidor: el `required`/`pattern` del HTML no es seguridad.
     */
    public static function validate(array $b): array
    {
        $g = fn(string $k) => trim((string) ($b[$k] ?? ''));
        $d = [
            'recipient'    => $g('recipient'),
            'phone'        => $g('phone'),
            'street'       => $g('street'),
            'ext_num'      => $g('ext_num'),
            'int_num'      => $g('int_num'),
            'neighborhood' => $g('neighborhood'),
            'city'         => $g('city'),
            'state'        => $g('state'),
            'postal_code'  => $g('postal_code'),
            'notes'        => $g('notes'),
        ];

        if (mb_strlen($d['recipient']) < 3)                 return [$d, 'Escribe el nombre de quien recibe.'];
        if (preg_match_all('/\d/', $d['phone']) < 10)       return [$d, 'El teléfono debe tener al menos 10 dígitos.'];
        if ($d['street'] === '')                            return [$d, 'Escribe la calle.'];
        if ($d['ext_num'] === '')                           return [$d, 'Escribe el número exterior.'];
        if ($d['neighborhood'] === '')                      return [$d, 'Escribe la colonia.'];
        if ($d['city'] === '')                              return [$d, 'Escribe la ciudad.'];
        if (!in_array($d['state'], self::ESTADOS, true))    return [$d, 'Selecciona un estado válido.'];
        if (!preg_match('/^\d{5}$/', $d['postal_code']))    return [$d, 'El código postal debe tener 5 dígitos.'];

        /* Topes de longitud iguales a las columnas: si no, MySQL truncaría en silencio
           (o fallaría en modo estricto) con un mensaje que no ayuda al cliente. */
        $max = ['recipient'=>160,'phone'=>40,'street'=>200,'ext_num'=>30,'int_num'=>30,
                'neighborhood'=>160,'city'=>120,'notes'=>255];
        foreach ($max as $k => $lim) {
            if (mb_strlen($d[$k]) > $lim) return [$d, 'El campo "' . $k . '" es demasiado largo.'];
        }
        return [$d, null];
    }

    /**
     * Crea una dirección. Si $default (o es la primera), la deja como predeterminada
     * y quita la marca a las demás — todo en una transacción para que nunca queden
     * dos predeterminadas ni cero.
     */
    public static function create(PDO $pdo, int $userId, array $d, bool $default): int
    {
        $pdo->beginTransaction();
        try {
            $n = (int) $pdo->query("SELECT COUNT(*) FROM user_addresses WHERE user_id = {$userId}")->fetchColumn();
            $default = $default || $n === 0;    // la primera SIEMPRE es la predeterminada

            if ($default) {
                $pdo->prepare('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?')->execute([$userId]);
            }
            $st = $pdo->prepare(
                'INSERT INTO user_addresses
                   (user_id, recipient, phone, street, ext_num, int_num, neighborhood, city, state, postal_code, notes, is_default)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
            );
            $st->execute([
                $userId, $d['recipient'], $d['phone'], $d['street'], $d['ext_num'],
                $d['int_num'] !== '' ? $d['int_num'] : null, $d['neighborhood'], $d['city'],
                $d['state'], $d['postal_code'], $d['notes'] !== '' ? $d['notes'] : null,
                $default ? 1 : 0,
            ]);
            $id = (int) $pdo->lastInsertId();
            $pdo->commit();
            return $id;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }

    /** Marca una como predeterminada (validando que sea del usuario). */
    public static function setDefault(PDO $pdo, int $userId, int $id): bool
    {
        $own = $pdo->prepare('SELECT 1 FROM user_addresses WHERE id = ? AND user_id = ?');
        $own->execute([$id, $userId]);
        if (!$own->fetchColumn()) return false;

        $pdo->beginTransaction();
        try {
            $pdo->prepare('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?')->execute([$userId]);
            $pdo->prepare('UPDATE user_addresses SET is_default = 1 WHERE id = ?')->execute([$id]);
            $pdo->commit();
            return true;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Borra una dirección del usuario. Si era la predeterminada y quedan otras, promueve
     * la más reciente a predeterminada (para no dejar al usuario sin default).
     * Valida la propiedad: solo borra si la dirección es de ese usuario.
     * @return bool  true si existía y se borró.
     */
    public static function delete(PDO $pdo, int $userId, int $id): bool
    {
        $st = $pdo->prepare('SELECT is_default FROM user_addresses WHERE id = ? AND user_id = ? LIMIT 1');
        $st->execute([$id, $userId]);
        $row = $st->fetch();
        if (!$row) return false;
        $eraDefault = (bool) $row['is_default'];

        $pdo->beginTransaction();
        try {
            $pdo->prepare('DELETE FROM user_addresses WHERE id = ? AND user_id = ?')->execute([$id, $userId]);
            if ($eraDefault) {
                $q = $pdo->prepare('SELECT id FROM user_addresses WHERE user_id = ? ORDER BY id DESC LIMIT 1');
                $q->execute([$userId]);
                $nueva = (int) ($q->fetchColumn() ?: 0);
                if ($nueva) $pdo->prepare('UPDATE user_addresses SET is_default = 1 WHERE id = ?')->execute([$nueva]);
            }
            $pdo->commit();
            return true;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }
}
