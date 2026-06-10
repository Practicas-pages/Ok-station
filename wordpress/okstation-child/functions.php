<?php
/**
 * OK.station — Child theme (Hello Elementor)
 * --------------------------------------------------------------
 * - Encola el design system: assets/okstation/styles.css + app.js
 * - Carga Poppins desde Google Fonts (con preconnect)
 * - Aplica defer al app.js (rendimiento)
 * - Inyecta SEO (Open Graph / Twitter) y JSON-LD LocalBusiness en la portada
 *
 * Coloca styles.css y app.js dentro de:  assets/okstation/
 * --------------------------------------------------------------
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Sin acceso directo.
}

/**
 * Encolar estilos y scripts.
 */
function okstation_enqueue_assets() {
	$theme_uri = get_stylesheet_directory_uri();
	$theme_dir = get_stylesheet_directory();

	// 1) Estilo del tema padre (Hello Elementor).
	wp_enqueue_style(
		'hello-elementor-parent',
		get_template_directory_uri() . '/style.css',
		array(),
		wp_get_theme( get_template() )->get( 'Version' )
	);

	// 2) Tipografía Poppins.
	wp_enqueue_style(
		'okstation-poppins',
		'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap',
		array(),
		null
	);

	// 3) Design system OK.station (cache-busting por fecha de archivo).
	$css_path = $theme_dir . '/assets/okstation/styles.css';
	wp_enqueue_style(
		'okstation-styles',
		$theme_uri . '/assets/okstation/styles.css',
		array( 'hello-elementor-parent' ),
		file_exists( $css_path ) ? filemtime( $css_path ) : '2.0'
	);

	// 4) Lógica de interacción (en el footer).
	$js_path = $theme_dir . '/assets/okstation/app.js';
	wp_enqueue_script(
		'okstation-app',
		$theme_uri . '/assets/okstation/app.js',
		array(),
		file_exists( $js_path ) ? filemtime( $js_path ) : '2.0',
		true
	);
}
add_action( 'wp_enqueue_scripts', 'okstation_enqueue_assets', 20 );

/**
 * Añadir defer al app.js.
 */
function okstation_defer_app( $tag, $handle ) {
	if ( 'okstation-app' === $handle ) {
		return str_replace( ' src', ' defer src', $tag );
	}
	return $tag;
}
add_filter( 'script_loader_tag', 'okstation_defer_app', 10, 2 );

/**
 * Preconnect a Google Fonts (rendimiento).
 */
function okstation_resource_hints( $hints, $relation ) {
	if ( 'preconnect' === $relation ) {
		$hints[] = array(
			'href'        => 'https://fonts.gstatic.com',
			'crossorigin' => 'anonymous',
		);
	}
	return $hints;
}
add_filter( 'wp_resource_hints', 'okstation_resource_hints', 10, 2 );

/**
 * SEO + datos estructurados — SOLO en la portada.
 *
 * IMPORTANTE: si usas Yoast SEO o Rank Math para los meta de Open Graph,
 * ELIMINA el bloque de <meta> de abajo (deja solo el JSON-LD) para no duplicar.
 */
function okstation_head_seo() {
	if ( ! is_front_page() ) {
		return;
	}

	$desc = 'Copias, impresiones, fotografías y trámites en Centro Comercial Otay, Tijuana. Precio justo y atención personal.';
	?>
	<meta name="theme-color" content="#066CFF">
	<meta name="geo.region" content="MX-BCN">
	<meta name="geo.placename" content="Tijuana, Baja California">
	<meta property="og:type" content="website">
	<meta property="og:site_name" content="OK.station">
	<meta property="og:locale" content="es_MX">
	<meta property="og:title" content="OK.station — Copias, impresiones, fotos y trámites en Tijuana">
	<meta property="og:description" content="<?php echo esc_attr( $desc ); ?>">
	<meta property="og:url" content="https://okstation.mx/">
	<meta property="og:image" content="https://okstation.mx/og-image.jpg">
	<meta name="twitter:card" content="summary_large_image">
	<meta name="twitter:title" content="OK.station — Copias, impresiones, fotos y trámites en Tijuana">
	<meta name="twitter:description" content="<?php echo esc_attr( $desc ); ?>">
	<meta name="twitter:image" content="https://okstation.mx/og-image.jpg">
	<script type="application/ld+json">
	{
		"@context": "https://schema.org",
		"@type": "LocalBusiness",
		"@id": "https://okstation.mx/#business",
		"name": "OK.station",
		"alternateName": "OK.station — una marca de OK Dock",
		"description": "Centro de copiado, impresión, fotografía y gestión de citas para trámites (pasaporte, visa americana y SENTRI) en Tijuana.",
		"url": "https://okstation.mx/",
		"telephone": "+52-664-104-4896",
		"email": "station@okdock.mx",
		"image": "https://okstation.mx/og-image.jpg",
		"priceRange": "$$",
		"currenciesAccepted": "MXN",
		"parentOrganization": { "@type": "Organization", "name": "OK Dock" },
		"address": {
			"@type": "PostalAddress",
			"streetAddress": "Centro Comercial Otay, Local G-03, Carretera Aeropuerto 1900",
			"addressLocality": "Tijuana",
			"addressRegion": "Baja California",
			"postalCode": "22425",
			"addressCountry": "MX"
		},
		"geo": { "@type": "GeoCoordinates", "latitude": 32.5360, "longitude": -116.9690 },
		"areaServed": { "@type": "City", "name": "Tijuana" }
	}
	</script>
	<?php
}
add_action( 'wp_head', 'okstation_head_seo' );
