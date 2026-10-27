<script module lang="ts">
	export type BottomSheetSnap = 'bottom' | 'middle' | 'top';
</script>

<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { Snippet } from 'svelte';

	let {
		snap = $bindable<BottomSheetSnap>('bottom'),
		onheightchange,
		children
	}: {
		snap?: BottomSheetSnap;
		/** アニメーション・ドラッグ中も、画面を覆っている高さを通知します。 */
		onheightchange?: (height: number) => void;
		children?: Snippet;
	} = $props();

	const snaps: readonly BottomSheetSnap[] = ['bottom', 'middle', 'top'];
	const snapLabels = { bottom: '下', middle: '中央', top: '上' };
	const id = $props.id();
	const contentId = `${id}-content`;
	let availableHeight = $state(0);
	let height = $state(96);
	let dragging = $state(false);
	let animationFrame: number | undefined;
	let pointerId: number | undefined;
	let startY = 0;
	let startHeight = 0;
	let lastY = 0;
	let lastTime = 0;
	let velocity = 0;
	let moved = false;
	let suppressClick = false;

	function snapHeight(position: BottomSheetSnap): number {
		const maximum = availableHeight || 96;
		if (position === 'top') return maximum;
		if (position === 'middle') return Math.max(Math.min(96, maximum), maximum / 2);
		return Math.min(96, maximum);
	}

	function cancelAnimation() {
		if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
		animationFrame = undefined;
	}

	function animateTo(target: number) {
		cancelAnimation();
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || height === target) {
			height = target;
			return;
		}
		const from = height;
		const started = performance.now();
		function animate(now: number) {
			const progress = Math.min(1, (now - started) / 260);
			height = from + (target - from) * (1 - (1 - progress) ** 3);
			animationFrame = progress < 1 ? requestAnimationFrame(animate) : undefined;
		}
		animationFrame = requestAnimationFrame(animate);
	}

	$effect(() => {
		// 親領域のリサイズ時も、現在のスナップ位置に合わせ直します。
		const position = snap;
		const maximum = availableHeight;
		if (maximum && !dragging) untrack(() => animateTo(snapHeight(position)));
	});
	$effect(() => {
		const currentHeight = height;
		untrack(() => onheightchange?.(currentHeight));
	});
	onDestroy(cancelAnimation);

	function startDrag(event: PointerEvent) {
		if (!event.isPrimary || event.button !== 0 || pointerId !== undefined) return;
		cancelAnimation();
		pointerId = event.pointerId;
		startY = lastY = event.clientY;
		startHeight = height;
		lastTime = event.timeStamp;
		velocity = 0;
		moved = suppressClick = false;
		dragging = true;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function moveDrag(event: PointerEvent) {
		if (event.pointerId !== pointerId) return;
		const elapsed = event.timeStamp - lastTime;
		if (elapsed > 0) velocity = elapsed <= 100 ? (event.clientY - lastY) / elapsed : 0;
		lastY = event.clientY;
		lastTime = event.timeStamp;
		if (Math.abs(event.clientY - startY) > 4) moved = true;
		height = Math.max(
			snapHeight('bottom'),
			Math.min(snapHeight('top'), startHeight + startY - event.clientY)
		);
	}

	function endDrag(event: PointerEvent, cancelled = false) {
		if (event.pointerId !== pointerId) return;
		if (!cancelled && moved) {
			const momentum = event.timeStamp - lastTime <= 100 ? velocity * 160 : 0;
			const projectedHeight = height - momentum;
			snap = snaps.reduce((nearest, candidate) =>
				Math.abs(snapHeight(candidate) - projectedHeight) <
				Math.abs(snapHeight(nearest) - projectedHeight)
					? candidate
					: nearest
			);
		}
		suppressClick = moved;
		pointerId = undefined;
		dragging = false;
		const handle = event.currentTarget as HTMLElement;
		if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
	}

	function cycleSnap() {
		if (suppressClick) {
			suppressClick = false;
			return;
		}
		snap = snaps[(snaps.indexOf(snap) + 1) % snaps.length];
	}

	function handleKeydown(event: KeyboardEvent) {
		const index = snaps.indexOf(snap);
		switch (event.key) {
			case 'ArrowUp':
				snap = snaps[Math.min(snaps.length - 1, index + 1)];
				break;
			case 'ArrowDown':
				snap = snaps[Math.max(0, index - 1)];
				break;
			case 'Home':
				snap = 'bottom';
				break;
			case 'End':
				snap = 'top';
				break;
			default:
				return;
		}
		event.preventDefault();
	}
</script>

<div class="bottom-sheet-root" bind:clientHeight={availableHeight}>
	<section
		class="bottom-sheet"
		class:dragging
		style:height={`${height}px`}
		data-snap={snap}
		aria-label="ボトムシート"
	>
		<button
			class="drag-handle"
			type="button"
			aria-label="ボトムシートの高さを変更"
			aria-describedby={`${id}-description`}
			aria-controls={contentId}
			aria-expanded={snap !== 'bottom'}
			onpointerdown={startDrag}
			onpointermove={moveDrag}
			onpointerup={(event) => endDrag(event)}
			onpointercancel={(event) => endDrag(event, true)}
			onlostpointercapture={(event) => endDrag(event, true)}
			onclick={cycleSnap}
			onkeydown={handleKeydown}
		>
			<span aria-hidden="true"></span>
		</button>
		<span class="sr-only" id={`${id}-description`}>
			現在の位置: {snapLabels[snap]}。上下矢印キーでも変更できます。
		</span>
		<div class="sheet-content" id={contentId}>
			{@render children?.()}
		</div>
	</section>
</div>

<style>
	.bottom-sheet-root {
		position: absolute;
		inset: max(16px, env(safe-area-inset-top)) 0 0;
		z-index: 1200;
		pointer-events: none;
	}

	.bottom-sheet {
		position: absolute;
		right: 0;
		bottom: 0;
		left: 0;
		display: flex;
		flex-direction: column;
		max-height: 100%;
		overflow: hidden;
		border-radius: 24px 24px 0 0;
		background: #fff;
		box-shadow: 0 -3px 20px rgb(0 0 0 / 15%);
		pointer-events: auto;
	}

	.drag-handle {
		display: flex;
		flex: 0 0 48px;
		align-items: center;
		justify-content: center;
		width: 100%;
		padding: 0;
		border: 0;
		border-radius: 24px 24px 0 0;
		background: transparent;
		cursor: grab;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
	}

	.drag-handle span {
		width: 36px;
		height: 4px;
		border-radius: 999px;
		background: #b8bdc5;
	}

	.drag-handle:focus-visible {
		outline: 2px solid #2563eb;
		outline-offset: -4px;
	}

	.dragging .drag-handle {
		cursor: grabbing;
	}

	.sheet-content {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0 16px max(16px, env(safe-area-inset-bottom));
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
