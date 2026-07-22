<?php
/**
 * Alcance del catálogo — qué categorías de Exel entran a la tienda
 * =============================================================================
 * Vive aparte porque DOS procesos necesitan la misma respuesta y no pueden
 * discrepar ni un día:
 *
 *   · backend/tools/exel-sync.php      decide qué se importa desde Exel.
 *   · backend/tools/aplicar-alcance.php decide qué se apaga de lo ya importado.
 *
 * Si cada uno llevara su propia lista, un cambio en una y no en la otra dejaría
 * la tienda en un estado imposible de explicar: productos que el sync publica y
 * el otro apaga en cuanto corre, o al revés. Una sola fuente de verdad.
 */

/* Decisión de negocio 2026-07-22: SOLO "Oficina y Escolar".
   Antes eran 13 categorías ("Papelería + impresión", junta del 2026-07-14), pero esa
   lista dejaba entrar cómputo: "Impresión y Multifuncionales" trae videocámaras y
   computadoras de escritorio, y "Consumibles" trae ruteadores. Con una sola categoría
   el problema desaparece de raíz y ya no hay que depurar subcategoría por subcategoría.

   Se puede cambiar el alcance SIN deploy con EXEL_CATEGORIAS en backend/.env
   (separadas por coma). Ojo: cambiarlo apaga o enciende productos en la tienda. */
const PAPELERIA_CATS = ['Oficina y Escolar'];

/** Lista blanca efectiva: la del .env si existe, si no la constante de arriba. */
function categorias_permitidas(): array
{
    $env = trim((string) env('EXEL_CATEGORIAS', ''));
    if ($env === '') return PAPELERIA_CATS;
    $cats = array_values(array_filter(array_map('trim', explode(',', $env)), 'strlen'));
    return $cats ?: PAPELERIA_CATS;
}

/**
 * ¿Esta categoría entra a la tienda?
 *
 * La comparación la hace AQUÍ y no cada quien por su lado a propósito: Exel manda
 * los nombres con mayúsculas y espacios inconsistentes ("Oficina y Escolar",
 * "OFICINA Y ESCOLAR ", …) y si un proceso normaliza distinto que el otro, el mismo
 * producto pasa en uno y no en el otro.
 */
function categoria_permitida(string $cat): bool
{
    $n = mb_strtolower(trim($cat), 'UTF-8');
    foreach (categorias_permitidas() as $c) {
        if (mb_strtolower(trim($c), 'UTF-8') === $n) return true;
    }
    return false;
}
