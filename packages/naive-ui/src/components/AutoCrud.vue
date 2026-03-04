<script setup lang="ts">
import type {
  ActionContext,
  CrudAction,
  CrudAdapter,
  CrudColumn,
  CrudField,
} from '@uozi/vito-core'
import type { PaginationProps } from 'naive-ui'
import type { FunctionalComponent } from 'vue'
import {
  createColumnsFromFields,
  presetActions,
  useCrudForm,
  useCrudList,
  useCrudRouteSync,
  useCrudSelection,
} from '@uozi/vito-core'
import { NButton, NCard, NSpace } from 'naive-ui'
import { computed, h, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { confirmAction, handleExportResult } from '../adapter'
import CrudForm from './CrudForm.vue'
import CrudSearch from './CrudSearch.vue'
import CrudTable from './CrudTable.vue'

type Row = Record<string, any>
type Query = Record<string, unknown>

export interface Props {
  /** Data adapter */
  adapter: CrudAdapter<Row, Query>
  /** Field definitions */
  fields: CrudField<Row>[]
  /** Column definitions (optional, generated from fields if not provided) */
  columns?: CrudColumn<Row>[]
  /** Search field definitions (optional, uses fields if not provided) */
  searchFields?: CrudField<Row>[]
  /**
   * Where CrudSearch reads/writes search conditions in query.
   * - undefined: flat query (default)
   * - 'search': nested query.search = { ... }
   */
  searchQueryKey?: string
  /** Custom actions */
  actions?: CrudAction<Row>[]
  /** Form display mode */
  formMode?: 'modal' | 'drawer'
  /** Show row selection checkboxes */
  showSelection?: boolean
  /** Show row actions column */
  showActionsColumn?: boolean
  /** Disable create action */
  disableCreate?: boolean
  /** Disable edit action */
  disableEdit?: boolean
  /** Disable delete action */
  disableDelete?: boolean
  /** Disable export action */
  disableExport?: boolean
  /** Card title */
  title?: string
  /** Pagination props */
  paginationProps?: PaginationProps
  /** Enable route query sync */
  routeSync?: boolean
  /** Route query key for sync */
  routeQueryKey?: string
}

export interface RowActionButtonProps<Row> {
  row: Row
}

const props = withDefaults(defineProps<Props>(), {
  formMode: 'modal',
  showSelection: false,
  showActionsColumn: true,
  disableCreate: false,
  disableEdit: false,
  disableDelete: false,
  disableExport: false,
  title: '列表',
  routeSync: false,
  routeQueryKey: 'q',
})

const emit = defineEmits<{
  (e: 'submit', payload: { mode: 'create' | 'edit', data: Partial<Row> }): void
  (e: 'success', payload: { mode: 'create' | 'edit', data: Row }): void
  (e: 'error', error: unknown): void
}>()

const slots = defineSlots<Record<string, any>>()

// Build extra props for row-actions slot
function getRowActionsSlotProps(row: Row) {
  return {
    openEdit: () => openEdit(row),
    actions: rowActions.value,
    defaultButtons,
  }
}

const reservedSlotNames = new Set([
  'toolbar',
  'before-table',
  'batch-actions',
  'row-actions',
  'search',
  'table',
  'form',
  'table-header',
  'footer',
])

// Forward slots to sub components (exclude reserved ones)
const forwardedSlots = computed(() => {
  const result: Record<string, any> = {}
  for (const name of Object.keys(slots)) {
    if (!reservedSlotNames.has(name)) {
      result[name] = slots[name]
    }
  }
  return result
})

// Initialize hooks
const list = useCrudList<Row, Query>({
  adapter: props.adapter,
  onError: err => emit('error', err),
})

const selection = useCrudSelection<Row>({
  rows: list.rows,
  getId: props.adapter.getId,
})

const form = useCrudForm<Row>({
  fields: props.fields,
})

// Route sync (optional)
let router: any = null
let route: any = null
try {
  router = useRouter()
  route = useRoute()
}
catch {
  // Not in router context
}

if (props.routeSync && router && route) {
  useCrudRouteSync({
    query: list.query,
    setQuery: list.setQuery,
    router,
    route,
    queryKey: props.routeQueryKey,
  })
}

// Form visibility
const formVisible = ref(false)
const editingRow = ref<Row | null>(null)

function setFormVisible(visible: boolean) {
  formVisible.value = visible
}

// Open create form
function openCreate() {
  editingRow.value = null
  form.reset()
  form.setMode('create')
  formVisible.value = true
}

// Open edit form
function openEdit(row: Row) {
  editingRow.value = row
  form.reset(row as Partial<Row>)
  form.setMode('edit')
  formVisible.value = true
}

// Build action context
function buildActionContext(row?: Row): ActionContext<Row> {
  return {
    row,
    selectedRows: selection.selectedRows.value,
    selectedIds: [...selection.selectedIds.value],
    query: (list.query.value ?? {}) as any,
    sort: list.sort.value,
    page: list.page.value,
    pageSize: list.pageSize.value,
    refresh: list.refresh,
    clearSelection: selection.clear,
  }
}

// Handle action click with confirm
async function handleActionClick(action: CrudAction<Row>, row?: Row) {
  const ctx = buildActionContext(row)

  // Check confirm
  if (action.confirm) {
    const message = typeof action.confirm === 'string' ? action.confirm : '确定要执行此操作吗？'
    const confirmed = await confirmAction(message)
    if (!confirmed)
      return
  }

  await action.onClick(ctx)
}

// Build default actions
const defaultActions = computed<CrudAction<Row>[]>(() => {
  const actions: CrudAction<Row>[] = []

  // Create action
  if (!props.disableCreate && props.adapter.create) {
    actions.push(presetActions.create({ onClick: openCreate }))
  }

  // Edit action
  if (!props.disableEdit && props.adapter.update) {
    actions.push(presetActions.edit({ onClick: openEdit }))
  }

  // Delete action
  if (!props.disableDelete && props.adapter.remove) {
    actions.push(presetActions.delete({
      adapter: props.adapter as any,
      getId: props.adapter.getId,
      onError: err => emit('error', err),
    }))
  }

  // Export action
  if (!props.disableExport && props.adapter.export) {
    actions.push(presetActions.export({
      adapter: props.adapter as any,
      handleExport: handleExportResult,
      onError: err => emit('error', err),
    }))
  }

  return actions
})

function mergeActions(
  baseActions: CrudAction<Row>[],
  overrideActions: CrudAction<Row>[] | undefined,
): CrudAction<Row>[] {
  if (!overrideActions || overrideActions.length === 0)
    return baseActions

  const result = [...baseActions]
  const indexById = new Map<string, number>()
  for (let i = 0; i < result.length; i++) {
    indexById.set(result[i].id, i)
  }

  for (const action of overrideActions) {
    const idx = indexById.get(action.id)
    if (idx !== undefined) {
      result[idx] = action
    }
    else {
      indexById.set(action.id, result.length)
      result.push(action)
    }
  }

  return result
}

// Merge custom actions with defaults (override by id)
const allActions = computed<CrudAction<Row>[]>(() => {
  return mergeActions(defaultActions.value, props.actions)
})

// Filter actions by area
function actionsByArea(area: CrudAction['area']): CrudAction<Row>[] {
  return allActions.value
    .filter((a) => {
      if (a.area !== area)
        return false
      const ctx = buildActionContext()
      if (a.visible && !a.visible(ctx))
        return false
      return true
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

// Row actions (edit + delete by default)
const rowActions = computed(() => actionsByArea('row'))
const toolbarActions = computed(() => actionsByArea('toolbar'))
const batchActions = computed(() => actionsByArea('batch'))

// Generate columns from fields if not provided
const effectiveColumns = computed<CrudColumn<Row>[]>(() => {
  if (props.columns) {
    return props.columns
  }
  return createColumnsFromFields(props.fields)
})

// Row key getter
const rowKey = computed(() => {
  return props.adapter.getId ?? ((row: Row) => (row as any).id)
})

// Handle form submit
async function handleFormSubmit(data: Partial<Row>) {
  const mode = form.mode.value
  emit('submit', { mode, data })

  try {
    if (mode === 'create' && props.adapter.create) {
      const created = await props.adapter.create(data)
      emit('success', { mode, data: created })
    }
    else if (mode === 'edit' && props.adapter.update && editingRow.value) {
      const id = rowKey.value(editingRow.value)
      const updated = await props.adapter.update(id, data)
      emit('success', { mode, data: updated })
    }

    formVisible.value = false
    await list.refresh()
  }
  catch (err) {
    emit('error', err)
  }
}

// Render action button
function renderActionButton(action: CrudAction<Row>, row?: Row) {
  const ctx = buildActionContext(row)
  const isDisabled = action.disabled?.(ctx) ?? false

  return h(
    NButton,
    {
      size: action.size ?? 'tiny',
      type: action.type ?? 'primary',
      disabled: isDisabled,
      tertiary: true,
      onClick: () => handleActionClick(action, row),
    },
    () => action.label,
  )
}

// Default action button components for row-actions slot
const EditButton: FunctionalComponent<RowActionButtonProps<Row>> = (btnProps) => {
  const action = rowActions.value.find(a => a.id === 'edit')
  if (!action)
    return null
  return renderActionButton(action, btnProps.row)
}

const DeleteButton: FunctionalComponent<RowActionButtonProps<Row>> = (btnProps) => {
  const action = rowActions.value.find(a => a.id === 'delete')
  if (!action)
    return null
  return renderActionButton(action, btnProps.row)
}

const ViewButton: FunctionalComponent<RowActionButtonProps<Row>> = (btnProps) => {
  const action = rowActions.value.find(a => a.id === 'view')
  if (!action)
    return null
  return renderActionButton(action, btnProps.row)
}

// All default action buttons
const defaultButtons = {
  Edit: EditButton,
  Delete: DeleteButton,
  View: ViewButton,
}

// Expose for external access
defineExpose({
  list,
  selection,
  form,
  refresh: list.refresh,
  openCreate,
  openEdit,
})
</script>

<template>
  <NCard :title="title">
    <!-- Toolbar -->
    <template #header-extra>
      <NSpace>
        <slot
          name="toolbar"
          :list="list"
          :selection="selection"
          :open-create="openCreate"
        >
          <template
            v-for="action in toolbarActions"
            :key="action.id"
          >
            <component :is="() => renderActionButton(action)" />
          </template>
        </slot>
      </NSpace>
    </template>

    <!-- Search -->
    <template v-if="searchFields?.length || fields.some(f => f.visibleIn?.searchForm !== false)">
      <slot
        name="search"
        :list="list"
        :fields="(searchFields ?? fields)"
      >
        <CrudSearch
          :list="list"
          :fields="searchFields ?? fields"
          :query-key="searchQueryKey"
        >
          <template
            v-for="(_, name) in forwardedSlots"
            :key="name"
            #[name]="slotProps"
          >
            <slot
              :name="name"
              v-bind="slotProps"
            />
          </template>
        </CrudSearch>
      </slot>
    </template>

    <!-- Before table slot -->
    <div
      v-if="$slots['before-table']"
      class="auto-crud__before-table"
    >
      <slot
        name="before-table"
        :list="list"
        :selection="selection"
      />
    </div>

    <!-- Batch actions -->
    <div
      v-if="batchActions.length > 0 && selection.selectedCount.value > 0"
      class="auto-crud__batch-actions"
    >
      <slot
        name="batch-actions"
        :list="list"
        :selection="selection"
        :actions="batchActions"
        :render-action-button="renderActionButton"
      >
        <NSpace>
          <span>已选择 {{ selection.selectedCount.value }} 项</span>
          <template
            v-for="action in batchActions"
            :key="action.id"
          >
            <component :is="() => renderActionButton(action)" />
          </template>
        </NSpace>
      </slot>
    </div>

    <!-- Table -->
    <slot
      name="table"
      :list="list"
      :columns="effectiveColumns"
      :selection="(showSelection ? selection : undefined)"
      :row-key="rowKey"
      :row-actions="rowActions"
      :render-action-button="renderActionButton"
      :get-row-actions-slot-props="getRowActionsSlotProps"
    >
      <CrudTable
        :list="list"
        :columns="effectiveColumns"
        :selection="showSelection ? selection : undefined"
        :row-key="rowKey"
        :show-actions-column="showActionsColumn && rowActions.length > 0"
        :pagination-props="paginationProps"
        :get-row-actions-slot-props="getRowActionsSlotProps"
      >
        <!-- Forward cell slots (reserved + row-actions excluded) -->
        <template
          v-for="(_, name) in forwardedSlots"
          :key="name"
          #[name]="slotProps"
        >
          <slot
            :name="name"
            v-bind="slotProps"
          />
        </template>

        <!-- row-actions: inject extra props via getRowActionsSlotProps -->
        <template #row-actions="slotProps">
          <slot
            name="row-actions"
            v-bind="slotProps"
          >
            <!-- Default: render all row actions -->
            <template
              v-for="action in rowActions"
              :key="action.id"
            >
              <component :is="() => renderActionButton(action, slotProps.row)" />
            </template>
          </slot>
        </template>
      </CrudTable>
    </slot>

    <!-- Form -->
    <slot
      name="form"
      :form="form"
      :fields="fields"
      :visible="formVisible"
      :set-visible="setFormVisible"
      :mode="form.mode.value"
      :editing-row="editingRow"
      :submit="handleFormSubmit"
    >
      <CrudForm
        v-model:visible="formVisible"
        :form="form"
        :fields="fields"
        :display-mode="formMode"
        @submit="handleFormSubmit"
      >
        <template
          v-for="(_, name) in forwardedSlots"
          :key="name"
          #[name]="slotProps"
        >
          <slot
            :name="name"
            v-bind="slotProps"
          />
        </template>
      </CrudForm>
    </slot>
  </NCard>
</template>

<style scoped>
.auto-crud__before-table {
  margin-bottom: 16px;
}

.auto-crud__batch-actions {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--n-color-hover);
  border-radius: 4px;
}
</style>
