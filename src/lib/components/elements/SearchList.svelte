<script lang="ts">
	import type { Poi } from '#lib';

	let { results, onselect } = $props<{
		results: Poi[];
		onselect: (poi: Poi) => void;
	}>();
</script>

{#if results.length > 0}
	<ul class="max-h-64 overflow-y-auto rounded-b border border-gray-300 bg-white" role="listbox">
		{#each results as poi (poi.id)}
			<li role="option" aria-selected="false">
				<button
					type="button"
					class="w-full px-3 py-2 text-left hover:bg-gray-100"
					onclick={() => onselect(poi)}
				>
					{poi.name}
				</button>
			</li>
		{/each}
	</ul>
{/if}
