<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import type { Poi } from '#lib';
	import SearchList from '#lib/components/elements/SearchList.svelte';
	import Fuse from 'fuse.js';
	import { pois } from '../../../data/pois';

	let {
		onselect,
		large,
		...rest
	}: {
		onselect: (poiId: string) => void;
		large?: boolean;
	} & Omit<HTMLInputAttributes, 'value' | 'onselect'> = $props();

	const MAX_RESULTS = 20;
	const fuse = new Fuse(pois, {
		keys: ['name', 'keys'],
		useTokenSearch: true,
		threshold: 0.3,
		ignoreLocation: true
	});

	let query = $state('');
	let open = $state(false);
	let activeIndex = $state(-1);

	const results = $derived(
		open && query.trim() ? fuse.search(query.trim(), { limit: MAX_RESULTS }).map((r) => r.item) : []
	);

	$effect(() => {
		results;
		activeIndex = -1;
	});

	$effect(() => {
		if (activeIndex >= 0) {
			document.getElementById(`search-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
		}
	});

	function select(poi: Poi) {
		query = poi.name;
		open = false;
		activeIndex = -1;
		onselect(poi.id);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.isComposing) return;
		const n = results.length;
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			open = true;
			if (n === 0) return;
			const d = e.key === 'ArrowDown' ? 1 : -1;
			activeIndex = activeIndex < 0 ? (d > 0 ? 0 : n - 1) : (activeIndex + d + n) % n;
		} else if (e.key === 'Enter' && results[activeIndex]) {
			e.preventDefault();
			select(results[activeIndex]);
		} else if (e.key === 'Escape') {
			open = false;
			activeIndex = -1;
		}
	}
</script>

<div class="relative {large ? 'w-160' : 'w-80'} h-14">
	<input
		type="search"
		class="w-full rounded-full border border-gray-300 bg-white px-3 py-2"
		placeholder="場所を検索"
		bind:value={query}
		oninput={() => (open = true)}
		{onkeydown}
		role="combobox"
		aria-expanded={results.length > 0}
		aria-controls="search-listbox"
		aria-activedescendant={activeIndex >= 0 ? `search-option-${activeIndex}` : undefined}
		{...rest}
	/>
	<div class="absolute z-10 w-full">
		<SearchList {results} {activeIndex} onselect={select} />
	</div>
</div>
