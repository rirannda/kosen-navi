<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import type { Poi } from '#lib';
	import PoiSearchList from '#lib/components/elements/PoiSearchList.svelte';
	import Fuse from 'fuse.js';
	import { pois } from '../../../data/pois';

	let {
		onselect,
		large,
		placeholder = '場所を検索',
		...rest
	}: {
		onselect: (poiId: string) => void;
		large?: boolean;
		placeholder?: string;
	} & Omit<HTMLInputAttributes, 'value' | 'onselect' | 'placeholder'> = $props();

	// 複数のPoiSearchInputを並べてもIDが衝突しないようにする
	const uid = $props.id();
	const listboxId = `${uid}-listbox`;
	const optionId = (i: number) => `${uid}-option-${i}`;

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

	function close() {
		open = false;
		activeIndex = -1;
	}

	function oninput() {
		open = true;
		activeIndex = -1;
	}

	function select(poi: Poi) {
		query = poi.name;
		close();
		onselect(poi.id);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.isComposing) return;
		const n = results.length;
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			open = true;
			if (n === 0) return;
			const step = e.key === 'ArrowDown' ? 1 : -1;
			activeIndex = activeIndex < 0 ? (step > 0 ? 0 : n - 1) : (activeIndex + step + n) % n;
		} else if (e.key === 'Enter' && results[activeIndex]) {
			e.preventDefault();
			select(results[activeIndex]);
		} else if (e.key === 'Escape') {
			close();
		}
	}
</script>

<div class="relative {large ? 'w-160' : 'w-80'} h-14">
	<input
		type="search"
		class="w-full rounded-full border border-gray-300 bg-white px-3 py-2"
		{placeholder}
		bind:value={query}
		{oninput}
		{onkeydown}
		role="combobox"
		aria-expanded={results.length > 0}
		aria-controls={listboxId}
		aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
		{...rest}
	/>
	<div class="absolute z-10 w-full">
		<PoiSearchList {results} {activeIndex} {listboxId} {optionId} onselect={select} />
	</div>
</div>
