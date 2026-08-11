import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { SpriteProgram } from "@bailin/character-protocol";
import { getCharacterDisplayNames } from "../../shared/character-display-name.js";
import { PetPreview } from "../../shared/pet-preview.js";
import { Skeleton, Spinner } from "../../shared/feedback.js";
import { Icon } from "../../shared/icon.js";

const LIBRARY_SCROLL_CLASS = "library-reorder-scroll";

/** 自动滚动只允许角色仓库列表容器，禁止带动整页 / window。 */
function canScrollLibraryListOnly(element: Element): boolean {
  return element instanceof HTMLElement && element.classList.contains(LIBRARY_SCROLL_CLASS);
}

/** 按列表布局高度（不含 transform 溢出）计算可滚动上限。 */
function getLibraryLayoutMaxScroll(scroller: HTMLElement): number {
  const list = scroller.querySelector(".library-reorder-list");
  const contentHeight =
    list instanceof HTMLElement ? list.offsetHeight : scroller.scrollHeight;
  return Math.max(0, contentHeight - scroller.clientHeight);
}

/** 把 autoScroll 钳在真实内容底部，避免追着 transform 撑高的 scrollHeight 继续滚。 */
function clampLibraryScrollToLayoutContent(): void {
  const scroller = document.querySelector(`.${LIBRARY_SCROLL_CLASS}`);
  if (!(scroller instanceof HTMLElement)) return;
  const layoutMax = getLibraryLayoutMaxScroll(scroller);
  if (scroller.scrollTop > layoutMax) {
    scroller.scrollTop = layoutMax;
  }
}

/** 进入调整模式时的轻量骨架：先画出行架，再挂真实列表，减轻等待焦虑。 */
export function ReorderShellSkeleton({
  count,
  label
}: {
  count: number;
  label: string;
}): JSX.Element {
  const n = Math.max(count, 1);
  return (
    <div
      className="plain-list library-reorder-list library-reorder-skeleton"
      role="list"
      aria-busy="true"
      aria-label={label}
    >
      {Array.from({ length: n }, (_, i) => (
        <div
          key={i}
          role="listitem"
          className="plain-list__item library-row library-row--reordering library-row--shell"
        >
          <span className="library-drag-handle library-drag-handle--static" aria-hidden="true">
            <Icon name="grip-vertical" size={14} />
          </span>
          <div className="library-row__body" style={{ cursor: "default" }}>
            <Skeleton width={44} height={44} radius={10} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Skeleton width={`${58 + ((i * 7) % 22)}%`} height={14} />
              <div style={{ marginTop: 8 }}>
                <Skeleton width={`${36 + ((i * 11) % 28)}%`} height={11} />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export interface ReorderLibraryItem {
  id: string;
  name: string;
  sourceName?: string;
  track: "utility" | "companion";
  isSkeleton: boolean;
  isActive: boolean;
}

const TRACK_CLASS: Record<ReorderLibraryItem["track"], string> = {
  utility: "bl-tag bl-tag--utility",
  companion: "bl-tag bl-tag--companion"
};

/** 只允许纵向移动，角色始终留在左侧列表列内。 */
const restrictToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0
});

export function CharacterReorderList({
  items,
  selectedId,
  thumbnails,
  reordering,
  pageMotion,
  isItemBusy,
  trackLabel,
  currentLabel,
  processingLabel,
  noEnglishName,
  skeletonLabel,
  dragHandleLabel,
  onPick,
  onReorder
}: {
  items: ReorderLibraryItem[];
  selectedId: string | null;
  thumbnails: Record<string, SpriteProgram | null>;
  reordering: boolean;
  /** 浏览态翻页入场；调整顺序时不传。 */
  pageMotion?: { nonce: number; direction: "forward" | "backward" };
  isItemBusy: (id: string) => boolean;
  trackLabel: (track: ReorderLibraryItem["track"]) => string;
  currentLabel: string;
  processingLabel: string;
  noEnglishName: string;
  skeletonLabel: string;
  dragHandleLabel: (displayName: string) => string;
  onPick: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
}): JSX.Element {
  const [activeId, setActiveId] = useState<string | null>(null);
  const ids = useMemo(() => items.map((c) => c.id), [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 3 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  function clearDragState(): void {
    setActiveId(null);
  }

  useEffect(() => {
    if (!reordering) clearDragState();
  }, [reordering]);

  // 拖拽期间每帧钳位：autoScroll 用 interval 滚，指针停住时也要挡住越界
  useEffect(() => {
    if (!reordering || !activeId) return;
    let raf = 0;
    const tick = (): void => {
      clampLibraryScrollToLayoutContent();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reordering, activeId]);

  function handleDragStart(event: DragStartEvent): void {
    if (!reordering) return;
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    clearDragState();
    if (!reordering || !over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(ids, oldIndex, newIndex));
  }

  function handleDragCancel(): void {
    clearDragState();
  }

  return (
    <DndContext
      sensors={reordering ? sensors : []}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      autoScroll={
        reordering
          ? {
              threshold: { x: 0.2, y: 0.18 },
              acceleration: 12,
              canScroll: canScrollLibraryListOnly
            }
          : false
      }
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div
          className={
            reordering
              ? "plain-list library-reorder-list"
              : "plain-list library-browse-list"
          }
          role="list"
        >
          {items.map((c, i) => (
            <SortableLibraryRow
              key={c.id}
              item={c}
              index={i}
              selected={selectedId === c.id}
              reordering={reordering}
              dragging={activeId === c.id}
              thumbnail={thumbnails[c.id]}
              busy={isItemBusy(c.id)}
              trackLabel={trackLabel(c.track)}
              currentLabel={currentLabel}
              processingLabel={processingLabel}
              noEnglishName={noEnglishName}
              skeletonLabel={skeletonLabel}
              dragHandleLabel={dragHandleLabel}
              pageMotion={reordering ? undefined : pageMotion}
              onPick={onPick}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableLibraryRow({
  item,
  index,
  selected,
  reordering,
  dragging,
  thumbnail,
  busy,
  trackLabel,
  currentLabel,
  processingLabel,
  noEnglishName,
  skeletonLabel,
  dragHandleLabel,
  pageMotion,
  onPick
}: {
  item: ReorderLibraryItem;
  index: number;
  selected: boolean;
  reordering: boolean;
  dragging: boolean;
  thumbnail: SpriteProgram | null | undefined;
  busy: boolean;
  trackLabel: string;
  currentLabel: string;
  processingLabel: string;
  noEnglishName: string;
  skeletonLabel: string;
  dragHandleLabel: (displayName: string) => string;
  pageMotion?: { nonce: number; direction: "forward" | "backward" };
  onPick: (id: string) => void;
}): JSX.Element {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id, disabled: !reordering });

  const displayName = getCharacterDisplayNames({
    name: item.name,
    sourceName: item.sourceName
  });

  const lift = Boolean(isDragging || dragging);
  // 原位拖动：锁死 x，只在左侧列表列内上下移动（不用 DragOverlay，避免飞到详情区）
  const rowTransform =
    transform && reordering ? { ...transform, x: 0 } : transform;
  const style: CSSProperties = {
    transform: reordering ? CSS.Transform.toString(rowTransform) : undefined,
    transition: reordering ? (lift ? undefined : transition) : undefined,
    zIndex: lift ? 6 : undefined,
    position: lift ? "relative" : undefined,
    // 首行 delay=0，按下即见首项；短 cascade 不抢按钮的即时反馈
    ...(!reordering && pageMotion
      ? { animationDelay: `${Math.min(index * 16, 80)}ms` }
      : null)
  };

  const className = [
    "plain-list__item",
    "library-row",
    reordering
      ? "library-row--reordering"
      : pageMotion
        ? `library-list-item--page-in library-list-item--${pageMotion.direction}`
        : "",
    selected ? "is-selected" : "",
    lift ? "is-dragging" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={setNodeRef} role="listitem" className={className} style={style}>
      <button
        type="button"
        ref={setActivatorNodeRef}
        className={
          reordering
            ? "library-drag-handle"
            : "library-drag-handle library-drag-handle--collapsed"
        }
        aria-hidden={!reordering}
        aria-label={reordering ? dragHandleLabel(displayName.chineseName) : undefined}
        {...(reordering ? { ...attributes, ...listeners } : {})}
        tabIndex={reordering ? 0 : -1}
        onClick={(e) => e.stopPropagation()}
      >
        <Icon name="grip-vertical" size={14} />
      </button>
      <button
        type="button"
        className="library-row__body"
        onClick={() => onPick(item.id)}
      >
        <LibraryRowVisual
          item={item}
          thumbnail={thumbnail}
          busy={busy}
          trackLabel={trackLabel}
          currentLabel={currentLabel}
          processingLabel={processingLabel}
          noEnglishName={noEnglishName}
          skeletonLabel={skeletonLabel}
        />
      </button>
    </div>
  );
}

function LibraryRowVisual({
  item,
  thumbnail,
  busy,
  trackLabel,
  currentLabel,
  processingLabel,
  noEnglishName,
  skeletonLabel,
  leading
}: {
  item: ReorderLibraryItem;
  thumbnail: SpriteProgram | null | undefined;
  busy: boolean;
  trackLabel: string;
  currentLabel: string;
  processingLabel: string;
  noEnglishName: string;
  skeletonLabel: string;
  leading?: ReactNode;
}): JSX.Element {
  const displayName = getCharacterDisplayNames({
    name: item.name,
    sourceName: item.sourceName
  });

  return (
    <>
      {leading}
      <div className={`library-item__thumb${item.isActive ? " is-active-pet" : ""}`}>
        {thumbnail ? (
          <PetPreview program={thumbnail} width={44} height={44} />
        ) : (
          <Skeleton width={44} height={44} radius={10} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row gap-2">
          <span
            className="display display--section"
            style={{
              fontSize: 14,
              lineHeight: 1.2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              minWidth: 0
            }}
          >
            {displayName.chineseName}
          </span>
          {item.isActive ? (
            <span className="bl-tag bl-tag--sm bl-tag--active">
              <span className="bl-tag__dot" />
              {currentLabel}
            </span>
          ) : null}
          {busy ? (
            <span className="bl-tag bl-tag--sm">
              <Spinner />
              {processingLabel}
            </span>
          ) : null}
        </div>
        <div className="row gap-2" style={{ marginTop: 6 }}>
          <span
            className="body-sm"
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0
            }}
          >
            {displayName.englishName || noEnglishName}
          </span>
          <span
            className={TRACK_CLASS[item.track]}
            style={{ flexShrink: 0, opacity: 0.78 }}
          >
            {trackLabel}
          </span>
          {item.isSkeleton ? (
            <span
              className="bl-tag bl-tag--skeleton"
              style={{ flexShrink: 0, opacity: 0.72 }}
            >
              {skeletonLabel}
            </span>
          ) : null}
        </div>
      </div>
    </>
  );
}
