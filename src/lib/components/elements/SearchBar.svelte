<script lang="ts">
	import Fuse from 'fuse.js';
	import { pois } from '../../../data/pois';
	import type { Poi } from '#lib';
	import SearchList from './SearchList.svelte';

	let { onselect } = $props<{ onselect: (poi: Poi) => void }>();

	const MAX_RESULTS = 20;
	const fuse = new Fuse(pois, {
		keys: ['name', 'keys'],
		useTokenSearch: true,
		threshold: 0.3,
		ignoreLocation: true
	});

	let query = $state('');
	let open = $state(false);

	const results = $derived(
		open && query.trim() ? fuse.search(query.trim(), { limit: MAX_RESULTS }).map((r) => r.item) : []
	);

	function select(poi: Poi) {
		query = poi.name;
		open = false;
		onselect(poi);
	}
</script>

<div class="relative w-full">
	<input
		type="search"
		class="w-full rounded border border-gray-300 bg-white px-3 py-2"
		placeholder="場所を検索"
		bind:value={query}
		oninput={() => (open = true)}
		onfocus={() => (open = true)}
	/>
	<div class="absolute z-10 w-full">
		<SearchList {results} onselect={select} />
	</div>
</div>
