<script lang="ts">
	import type { BuildingMap } from '../../data/maps';
	import type { FloorControlPlacement } from '../map/floorControlLayout';
	let {
		buildings,
		positions,
		colors,
		activeFloors,
		onfloorchange,
		onresize,
		container = $bindable<HTMLDivElement>()
	}: {
		buildings: readonly BuildingMap[];
		positions: Readonly<Record<string, FloorControlPlacement>>;
		colors: Readonly<Record<string, string>>;
		activeFloors: Readonly<Record<string, number>>;
		onfloorchange: (buildingId: string, floor: number) => void;
		onresize: () => void;
		container?: HTMLDivElement;
	} = $props();
	function observeControl(element: HTMLElement) {
		const observer = new ResizeObserver(onresize);
		observer.observe(element);
		return { destroy: () => observer.disconnect() };
	}
</script>

{#if buildings.length}
	<div class="building-controls pointer-events-none absolute inset-0 z-1000" bind:this={container}>
		<svg
			class="building-control-connectors absolute inset-0 size-full overflow-hidden"
			aria-hidden="true"
		>
			{#each buildings as building (building.id)}
				{@const position = positions[building.id]}
				{#if position}
					<g style:--building-outline-color={colors[building.id]}>
						<line
							data-connector={building.id}
							x1={position.anchorX}
							y1={position.anchorY}
							x2={position.lineX}
							y2={position.lineY}
						/>
						<circle cx={position.anchorX} cy={position.anchorY} r="3" />
					</g>
				{/if}
			{/each}
		</svg>
		{#each buildings as building (building.id)}
			{@const position = positions[building.id]}
			<section
				class="custom-control-panel"
				use:observeControl
				style:transform={`translate(${position?.x ?? 0}px, ${position?.y ?? 0}px)`}
				style:visibility={position ? 'visible' : 'hidden'}
				style:--building-outline-color={colors[building.id]}
				data-building={building.id}
				data-snap={position?.side}
				aria-label={`${building.name}の階`}
			>
				<h3>{building.name}</h3>
				<div class="floor-buttons">
					{#each Object.keys(building.floors)
						.map(Number)
						.sort((a, b) => b - a) as floor (floor)}
						<button
							class:active={activeFloors[building.id] === floor}
							aria-pressed={activeFloors[building.id] === floor}
							onclick={() => onfloorchange(building.id, floor)}
							type="button"
						>
							{floor < 0 ? `B${-floor}` : `${floor}F`}
						</button>
					{/each}
				</div>
			</section>
		{/each}
	</div>
{/if}

<style>
	.building-control-connectors line {
		stroke: var(--building-outline-color);
		stroke-width: 1.5;
		opacity: 0.8;
	}

	.building-control-connectors circle {
		fill: var(--building-outline-color);
	}

	.custom-control-panel {
		position: absolute;
		top: 0;
		left: 0;
		width: max-content;
		max-width: min(180px, calc(100% - 16px));
		background: rgba(255, 255, 255, 0.96);
		border-top: 3px solid var(--building-outline-color);
		padding: 8px;
		border-radius: 10px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
		pointer-events: auto;
	}

	.custom-control-panel h3 {
		margin: 0 0 6px;
		font-size: 12px;
		line-height: 1.3;
		color: var(--building-outline-color, #333);
		text-align: center;
	}

	.floor-buttons {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 4px;
	}

	.floor-buttons button {
		min-width: 30px;
		min-height: 30px;
		padding: 4px 6px;
		font-size: 12px;
		border: 1px solid #ccc;
		background: white;
		border-radius: 5px;
		cursor: pointer;
		font-weight: bold;
	}

	.floor-buttons button:hover {
		background: #f8f9fa;
	}

	.floor-buttons button.active {
		background: var(--building-outline-color, #2563eb);
		color: white;
		border-color: var(--building-outline-color, #2563eb);
	}
</style>
