import { convertRemToPixels } from '$lib/utils';
import type { Attachment } from 'svelte/attachments';

interface PaneDragOptions {
  /** Function that provides whether the pane needs to be minimized after movement. */
  setMinimized: (value: boolean) => void;
  /** The smallest height to which the pane may shrink while dragging */
  minHeight?: number;
  /** The maximum height for a pane. Used for determing whether to snap to mnimized or expanded mode. */
  maxHeight: number;
  mobile?: {
    /** When mobile mode activates (<= screenWidth) */
    screenWidthCutoff: number;
    /** How much to horixontally offset as expanding from collapsed mode to expanded mode. */
    offsetX: number;
    /** How much to expand the width. */
    expandX: number;
  };
  /** Once dragging has occured this amount, pointer events will be blocked. Useful for users who have a tendency to hold left click down and start moving their mouse before releasing. Defaults to 5 pixels. */
  pointerEventsBlockThreshold?: number;
}

export function draggablePane({
  setMinimized,
  minHeight = 10,
  maxHeight,
  mobile = { screenWidthCutoff: 540, offsetX: convertRemToPixels(1), expandX: convertRemToPixels(2) },
  pointerEventsBlockThreshold = 5,
}: PaneDragOptions): Attachment {
  return ((draggableElement: Element) => {
    let isDragging = false;
    let isMouseDown = false;
    let isBlockingAdditionalPointerEvents = false;
    let dragStartY = 0;
    let dragStartHeight = 0;

    // pending movement animation data
    let pendingDeltaY: number | null = null;
    let pendingOffsetX: number | null = null;
    let pendingWidthChange: number | null = null;
    let animationFrameId: number | null = null;

    // velocity calculation
    type Sample = { y: number; t: number };
    let movementSamples: Sample[] = [];

    // track the initial width of the aside element
    // so we can adjust it in mobile mode
    let initialAsideWidth: number;

    // register the pointer down event on the draggable element
    // (for triggering the drag)
    $effect(() => {
      if (!draggableElement || !(draggableElement instanceof HTMLElement)) return;

      // detect drag start
      draggableElement.addEventListener('pointerdown', handleDragStart);

      // prevent dragging if selecting text
      draggableElement.addEventListener('selectstart', handleDragEnd);
      draggableElement.addEventListener('selectionchange', handleDragEnd);

      return () => {
        draggableElement.removeEventListener('pointerdown', handleDragStart);
        draggableElement.removeEventListener('selectstart', handleDragEnd);
        draggableElement.removeEventListener('selectionchange', handleDragEnd);
      };
    });

    // register the pointer move and pointer up events on the document
    // (for handling the drag)
    $effect(() => {
      if (!document) return;

      document.addEventListener('pointermove', handleDrag);
      document.addEventListener('pointerup', handleDragEnd);
      document.addEventListener('pointercancel', handleDragEnd);

      return () => {
        document.removeEventListener('pointermove', handleDrag);
        document.removeEventListener('pointerup', handleDragEnd);
        document.removeEventListener('pointercancel', handleDragEnd);
      };
    });

    /**
     * Listens for pointer down events on the header bar to start dragging
     * @param event
     */
    function handleDragStart(event: PointerEvent) {
      if (!draggableElement || !(draggableElement instanceof HTMLElement)) return;

      dragStartY = event.clientY;
      dragStartHeight = draggableElement.offsetHeight;

      initialAsideWidth = draggableElement.offsetWidth;

      isMouseDown = true;
    }

    /**
     * Listens for pointer move events on the document to resize the pane while dragging
     * @param event
     */
    function handleDrag(event: PointerEvent) {
      if (!isMouseDown) return;
      if (!draggableElement || !(draggableElement instanceof HTMLElement)) return;
      event.preventDefault();

      // track movement samples for velocity calculation
      const y = event.clientY;
      const t = performance.now();
      movementSamples.push({ y, t });
      const cutoff = t - 100; // keep a small history window (100 ms)
      movementSamples = movementSamples.filter((s) => s.t >= cutoff);

      // determine if there has been any vertical movement
      if (!isDragging) {
        isDragging = movementSamples.some((sample) => sample.y !== dragStartY);
      }
      if (!isDragging) {
        return;
      }

      // prevent button clicks and other pointer events during drag
      // once the movement exceeds a small threshold
      if (!isBlockingAdditionalPointerEvents) {
        isBlockingAdditionalPointerEvents = movementSamples.some(
          (sample) => Math.abs(sample.y - dragStartY) > pointerEventsBlockThreshold
        );
      }
      if (isBlockingAdditionalPointerEvents) {
        draggableElement.style.pointerEvents = 'none';
      }

      // calculate the difference in Y position
      // are store it for the next animation frame
      pendingDeltaY = dragStartY - event.clientY;

      // calculate how much to adjust the width and
      // horizontal position partial changes based
      // on the current heigh (mobile mode only)
      if (window.innerWidth <= mobile.screenWidthCutoff) {
        // calculate how close we are to min vs max height (0 to 1 scale)
        const currentHeight = dragStartHeight + pendingDeltaY;
        const heightRatio = Math.min(Math.max((currentHeight - minHeight) / (maxHeight - minHeight), 0), 1);

        // slowly offset the pane to the left as we expand
        // so that the pane moves to the left edge of the screen
        // when fully expanded
        pendingOffsetX = mobile.offsetX * heightRatio;

        // slowly adjust the width of the pane as we expand/minimize
        // so that the right side of the pane aligns with the screen edge
        // when fully expanded
        const startedExpanded = dragStartHeight >= maxHeight;
        pendingWidthChange = (() => {
          if (startedExpanded) {
            // slowly shrink the width as we progressively minimize
            return -mobile.expandX * (1 - heightRatio);
          }

          // slowly expand the width as we progressively restore
          return mobile.expandX * heightRatio;
        })();
      }

      if (animationFrameId === null) {
        animationFrameId = requestAnimationFrame(updatePlacement);
      }
    }

    /**
     * Updates the height, width, and x-translation of the pane during dragging
     */
    function updatePlacement() {
      if (
        !isDragging ||
        !draggableElement ||
        !(draggableElement instanceof HTMLElement) ||
        pendingDeltaY === null
      ) {
        animationFrameId = null;
        return;
      }

      // offset the default height by the deltaY
      const newHeight = Math.max(minHeight, dragStartHeight + pendingDeltaY);
      draggableElement.style.height = newHeight + 'px';

      // apply pending x-axis changes in mobile mode
      if (pendingOffsetX) {
        draggableElement.style.transform = `translateX(-${pendingOffsetX}px)`;
      }
      if (pendingWidthChange) {
        draggableElement.style.width = `calc(${initialAsideWidth}px + ${pendingWidthChange}px)`;
      }

      pendingDeltaY = null;
      pendingOffsetX = null;
      pendingWidthChange = null;
      animationFrameId = null;
    }

    /**
     * Computes the velocity of the drag based on recent movement samples
     */
    function computeVelocity() {
      if (movementSamples.length < 2) return 0;

      const firstSample = movementSamples[0];
      const lastSample = movementSamples[movementSamples.length - 1];

      const deltaY = lastSample.y - firstSample.y;
      const deltaT = lastSample.t - firstSample.t;

      return deltaT === 0 ? 0 : deltaY / deltaT; // pixels per millisecond
    }

    /**
     * Listens for pointer up events on the document to end dragging
     */
    function handleDragEnd() {
      isMouseDown = false;
      isDragging = false;
      isBlockingAdditionalPointerEvents = false;

      if (!draggableElement || !(draggableElement instanceof HTMLElement)) return;

      // compute the final velocity
      const velocity = computeVelocity();

      // if the final velocity is downward and significant, minimize the pane
      if (velocity > 1) {
        setMinimized(true);
      }

      // if the final velocity is upward and significant, restore the pane
      else if (velocity < -1) {
        setMinimized(false);
      }

      // if the final height is less than half of the maximum/full height, minimize the pane
      else {
        const currentHeight = draggableElement.offsetHeight;
        setMinimized(currentHeight < maxHeight / 2);
      }

      // clear any inline style
      draggableElement.style.height = '';
      draggableElement.style.transform = '';
      draggableElement.style.width = '';
      draggableElement.style.pointerEvents = ''; // re-enable pointer events

      // clear movement samples
      movementSamples = [];
    }
  }) satisfies Attachment;
}
