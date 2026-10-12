<script lang="ts">
	import { SITE_NAME, SITE_TAGLINE, absoluteUrl } from '$lib/site';

	let {
		title,
		description,
		path,
		ogType = 'website'
	}: {
		title: string;
		description: string;
		path: string;
		ogType?: 'website' | 'article';
	} = $props();

	const url = $derived(absoluteUrl(path));
	const image = absoluteUrl('/og.png');
</script>

<!--
	Shared SEO head: title, description, canonical URL, Open Graph, and Twitter
	cards. One static og:image is shared by every page.
-->
<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={url} />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:type" content={ogType} />
	<meta property="og:url" content={url} />
	<meta property="og:image" content={image} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="{SITE_NAME}: {SITE_TAGLINE}" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={image} />
	<meta name="twitter:image:alt" content="{SITE_NAME}: {SITE_TAGLINE}" />
</svelte:head>
