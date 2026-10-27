import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import BottomSheet from '../BottomSheet.svelte';

afterEach(() => vi.restoreAllMocks());

async function renderSheet() {
	const onheightchange = vi.fn();
	const rendered = await render(BottomSheet, { onheightchange });
	rendered.container.style.cssText = 'position: relative; width: 390px; height: 800px';
	const sheet = rendered.container.querySelector<HTMLElement>('.bottom-sheet')!;
	const handle = rendered.container.querySelector<HTMLButtonElement>('.drag-handle')!;
	await expect.poll(() => sheet.getBoundingClientRect().height).toBe(96);
	return { ...rendered, sheet, handle, onheightchange };
}

function pointer(handle: HTMLElement, type: string, y: number, time: number) {
	const event = new PointerEvent(type, {
		bubbles: true,
		pointerId: 1,
		pointerType: 'touch',
		isPrimary: true,
		button: 0,
		clientY: y
	});
	Object.defineProperty(event, 'timeStamp', { value: time });
	handle.dispatchEvent(event);
}

describe('BottomSheet', () => {
	it('初期状態は下に表示し、タップで中央・上・下に切り替える', async () => {
		const { sheet, handle, getByRole, onheightchange } = await renderSheet();
		expect(sheet.dataset.snap).toBe('bottom');
		expect(handle.getAttribute('aria-expanded')).toBe('false');
		const button = getByRole('button', { name: 'ボトムシートの高さを変更' });
		await button.click();
		await expect.poll(() => sheet.getBoundingClientRect().height).toBe(392);
		expect(sheet.dataset.snap).toBe('middle');
		expect(handle.getAttribute('aria-expanded')).toBe('true');
		await button.click();
		await expect.poll(() => sheet.getBoundingClientRect().height).toBe(784);
		expect(sheet.dataset.snap).toBe('top');
		await button.click();
		await expect.poll(() => sheet.getBoundingClientRect().height).toBe(96);
		await expect.poll(() => onheightchange.mock.lastCall?.[0]).toBe(96);
	});

	it('タッチのドラッグに追従して3段階にスナップし、直後のクリックで飛ばさない', async () => {
		const { sheet, handle, onheightchange } = await renderSheet();
		vi.spyOn(handle, 'setPointerCapture').mockImplementation(() => {});
		pointer(handle, 'pointerdown', 720, 100);
		pointer(handle, 'pointermove', 440, 500);
		await expect.poll(() => sheet.getBoundingClientRect().height).toBe(376);
		expect(onheightchange).toHaveBeenLastCalledWith(376);
		pointer(handle, 'pointerup', 440, 700);
		handle.click();
		await expect.poll(() => sheet.getBoundingClientRect().height).toBe(392);
		expect(sheet.dataset.snap).toBe('middle');
		pointer(handle, 'pointerdown', 440, 800);
		pointer(handle, 'pointermove', 0, 1200);
		pointer(handle, 'pointerup', 0, 1400);
		await expect.poll(() => sheet.getBoundingClientRect().height).toBe(784);
		expect(sheet.dataset.snap).toBe('top');
		pointer(handle, 'pointerdown', 0, 1500);
		pointer(handle, 'pointermove', 1000, 1900);
		pointer(handle, 'pointerup', 1000, 2100);
		await expect.poll(() => sheet.getBoundingClientRect().height).toBe(96);
		expect(sheet.dataset.snap).toBe('bottom');
	});

	it('ドラッグの中断では元のスナップ位置へ戻す', async () => {
		const { sheet, handle } = await renderSheet();
		vi.spyOn(handle, 'setPointerCapture').mockImplementation(() => {});
		pointer(handle, 'pointerdown', 720, 100);
		pointer(handle, 'pointermove', 240, 500);
		await expect.poll(() => sheet.getBoundingClientRect().height).toBe(576);
		pointer(handle, 'pointercancel', 240, 700);
		await expect.poll(() => sheet.getBoundingClientRect().height).toBe(96);
		expect(sheet.dataset.snap).toBe('bottom');
	});

	it('キーボードで各段階へ移動し、画面の高さが変わっても位置を維持する', async () => {
		const { container, sheet, handle } = await renderSheet();
		const key = (key: string) =>
			handle.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
		key('ArrowUp');
		await expect.poll(() => sheet.getBoundingClientRect().height).toBe(392);
		container.style.height = '600px';
		await expect.poll(() => sheet.getBoundingClientRect().height).toBe(292);
		key('End');
		await expect.poll(() => sheet.getBoundingClientRect().height).toBe(584);
		key('ArrowDown');
		await expect.poll(() => sheet.getBoundingClientRect().height).toBe(292);
		key('Home');
		await expect.poll(() => sheet.getBoundingClientRect().height).toBe(96);
	});
});
