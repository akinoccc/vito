import type { ComputedRef, Reactive, Ref } from 'vue'

// =============================================================================
// Core Types - Simplified with only 2 essential generics (Row, Query)
// =============================================================================

/**
 * Sort configuration
 */
export interface CrudSort<Field extends string = string> {
  field: Field
  order: 'ascend' | 'descend'
}

/**
 * Field visibility context
 */
export interface FieldContext<Row = any, FormModel = Row> {
  surface: 'searchForm' | 'table' | 'editForm' | 'detail'
  row?: Row
  formModel?: FormModel
  query?: Record<string, unknown>
}

/**
 * Cell render context for table columns
 */
export interface CellContext<Row = any> {
  row: Row
  rowIndex: number
  value: any
}

/** Alias for backward compatibility */
export type CrudTableCellContext<Row = any> = CellContext<Row>

/**
 * Field definition - core schema for form/search/table
 */
export type CrudFieldType
  = | 'text'
    | 'textarea'
    | 'select'
    | 'date'
    | 'datetime'
    | 'dateRange'
    | 'datetimeRange'
    | 'switch'
    | 'number'
    | 'money'
    | 'custom'

export interface CrudField<Row = any, FormModel = Row, UiExt = unknown> {
  key: string
  label: string | (() => string)
  type: CrudFieldType | (string & {})
  required?: boolean
  visibleIn?: {
    searchForm?: boolean | ((ctx: FieldContext<Row, FormModel>) => boolean)
    table?: boolean | ((ctx: FieldContext<Row, FormModel>) => boolean)
    editForm?: boolean | ((ctx: FieldContext<Row, FormModel>) => boolean)
    detail?: boolean | ((ctx: FieldContext<Row, FormModel>) => boolean)
  }
  /** UI-specific extensions, defined by adapter layer */
  ui?: UiExt
}

/**
 * Table column definition
 */
export interface CrudColumn<Row = any, UiExt = unknown> {
  key: string
  label?: string | (() => string)
  width?: number
  minWidth?: number
  fixed?: 'left' | 'right'
  sortable?: boolean
  render?: (ctx: CellContext<Row>) => any
  /** UI-specific extensions */
  ui?: UiExt
}

// =============================================================================
// Adapter Types
// =============================================================================

export interface ListParams<Query = Record<string, unknown>> {
  page: number
  pageSize: number
  query: Query
  sort?: CrudSort | null
  signal?: AbortSignal
}

export interface ListResult<Row = any> {
  items: Row[]
  total: number
}

export interface ExportParams<Query = Record<string, unknown>> {
  query: Query
  sort?: CrudSort | null
  signal?: AbortSignal
}

export type ExportResult
  = Blob
    | { blob: Blob, filename?: string }
    | { url: string, filename?: string }

/**
 * CRUD data adapter interface
 */
export interface CrudAdapter<Row = any, Query = Record<string, unknown>> {
  list: (params: ListParams<Query>) => Promise<ListResult<Row>>
  create?: (data: Partial<Row>) => Promise<Row>
  update?: (id: string | number, data: Partial<Row>) => Promise<Row>
  remove?: (id: string | number) => Promise<void>
  export?: (params: ExportParams<Query>) => Promise<ExportResult>
  getId?: (row: Row) => string | number
}

// =============================================================================
// Hook Return Types
// =============================================================================

export interface UseCrudListOptions<Row = any, Query = Record<string, unknown>> {
  adapter: CrudAdapter<Row, Query>
  initialQuery?: Query
  initialPage?: number
  initialPageSize?: number
  autoFetch?: boolean
  debounceMs?: number
  dedupe?: boolean
  onError?: (error: unknown) => void
}

export interface UseCrudListReturn<Row = any, Query = Record<string, unknown>> {
  // State
  rows: Ref<Row[]>
  total: Ref<number>
  loading: Ref<boolean>
  error: Ref<unknown>

  // Pagination
  page: Ref<number>
  pageSize: Ref<number>

  // Query & Sort
  query: Ref<Query>
  sort: Ref<CrudSort | null>

  // Actions
  refresh: () => Promise<void>
  setQuery: (partial: Partial<Query>, options?: SetQueryOptions) => void
  setPage: (page: number) => void
  setPageSize: (size: number) => void
  setSort: (sort: CrudSort | null) => void
  reset: () => void
}

export interface SetQueryOptions {
  /**
   * How to apply the partial query update
   * - merge: shallow merge into existing query (default)
   * - replace: replace the whole query with partial
   */
  mode?: 'merge' | 'replace'
  /** Keys to delete from current query before applying the update (useful for flat search forms) */
  clearKeys?: string[]
  /**
   * Remove empty values after applying update.
   * Treats `undefined | null | '' | [] | {}` as empty (deep).
   * Keeps `0` / `false`.
   */
  pruneEmpty?: boolean
}

export interface UseCrudFormOptions<Row = any> {
  fields: CrudField<Row>[]
  initialData?: Partial<Row>
}

export interface UseCrudFormReturn<Row = any> {
  // State
  model: Reactive<Partial<Row>>
  mode: Ref<'create' | 'edit'>
  dirty: ComputedRef<boolean>
  changedKeys: ComputedRef<string[]>
  changedData: ComputedRef<Partial<Row>>

  // Visible fields (filtered by visibleIn)
  visibleFields: ComputedRef<CrudField<Row>[]>

  // Actions
  reset: (data?: Partial<Row>) => void
  setMode: (mode: 'create' | 'edit') => void
  getSubmitData: () => Partial<Row>
}

export interface UseCrudSelectionOptions<Row = any> {
  rows: Ref<Row[]>
  getId?: (row: Row) => string | number
}

export interface UseCrudSelectionReturn<Row = any> {
  selectedIds: Ref<Set<string | number>>
  selectedRows: ComputedRef<Row[]>
  selectedCount: ComputedRef<number>

  /** Replace the whole selectedIds set (used by UI adapters to keep cross-page selection stable) */
  setSelectedIds: (ids: (string | number)[]) => void
  select: (id: string | number) => void
  deselect: (id: string | number) => void
  toggle: (id: string | number) => void
  selectAll: () => void
  clear: () => void
  isSelected: (id: string | number) => boolean
}

// =============================================================================
// Action Types
// =============================================================================

export interface ActionContext<Row = any> {
  row?: Row
  selectedRows: Row[]
  selectedIds: (string | number)[]
  /** Current list query (if available) */
  query?: Record<string, unknown>
  /** Current list sort (if available) */
  sort?: CrudSort | null
  /** Current page (if available) */
  page?: number
  /** Current page size (if available) */
  pageSize?: number
  refresh: () => Promise<void>
  clearSelection: () => void
}

export interface CrudAction<Row = any> {
  id: string
  label: string
  icon?: any
  type?: 'primary' | 'default' | 'success' | 'warning' | 'error'
  size?: 'tiny' | 'small' | 'medium' | 'large'
  area: 'toolbar' | 'row' | 'batch'
  order?: number
  confirm?: boolean | string
  visible?: (ctx: ActionContext<Row>) => boolean
  disabled?: (ctx: ActionContext<Row>) => boolean
  onClick: (ctx: ActionContext<Row>) => Promise<void> | void
}

export interface UseCrudActionsOptions<Row = any> {
  actions?: CrudAction<Row>[]
  adapter?: CrudAdapter<Row>
  getId?: (row: Row) => string | number
  refresh?: () => Promise<void>
  clearSelection?: () => void
  onError?: (error: unknown) => void
}

export interface UseCrudActionsReturn<Row = any> {
  actions: Ref<CrudAction<Row>[]>
  getByArea: (area: CrudAction['area']) => CrudAction<Row>[]
  register: (action: CrudAction<Row>) => void
  unregister: (id: string) => void
}
