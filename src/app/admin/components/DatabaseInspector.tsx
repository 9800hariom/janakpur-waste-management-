'use client'

import { useState, useEffect } from 'react'
import { getDatabaseTablesList, getTableDetails, TableSummary, ColumnInfo } from '@/utils/db/dbInspectorActions'
import { Database, Search, RefreshCw, ChevronLeft, ChevronRight, Eye, Code, Table as TableIcon, Key, Info, Terminal, Layers } from 'lucide-react'
import { toast } from 'react-hot-toast'

export function DatabaseInspector() {
  const [tables, setTables] = useState<TableSummary[]>([])
  const [selectedTable, setSelectedTable] = useState<string>('')
  const [loadingTables, setLoadingTables] = useState<boolean>(true)
  const [loadingData, setLoadingData] = useState<boolean>(false)

  const [columns, setColumns] = useState<ColumnInfo[]>([])
  const [rows, setRows] = useState<any[]>([])
  const [page, setPage] = useState<number>(1)
  const [pageSize] = useState<number>(12)
  const [totalCount, setTotalCount] = useState<number>(0)
  const [totalPages, setTotalPages] = useState<number>(1)
  const [searchQuery, setSearchQuery] = useState<string>('')

  const [selectedRow, setSelectedRow] = useState<any | null>(null)
  const [activeSubTab, setActiveSubTab] = useState<'data' | 'schema'>('data')

  useEffect(() => {
    loadTables()
  }, [])

  useEffect(() => {
    if (selectedTable) {
      loadTableData(selectedTable, page, searchQuery)
    }
  }, [selectedTable, page])

  const loadTables = async () => {
    setLoadingTables(true)
    try {
      const list = await getDatabaseTablesList()
      setTables(list)
      if (list.length > 0 && !selectedTable) {
        setSelectedTable(list[0].name)
      }
    } catch (err) {
      toast.error('Failed to load sqlite.db table list')
    } finally {
      setLoadingTables(false)
    }
  }

  const loadTableData = async (tableName: string, currentPage: number, search: string) => {
    setLoadingData(true)
    try {
      const data = await getTableDetails(tableName, currentPage, pageSize, search)
      setColumns(data.columns)
      setRows(data.rows)
      setTotalCount(data.totalCount)
      setTotalPages(data.totalPages)
    } catch (err) {
      toast.error(`Error loading table ${tableName}`)
    } finally {
      setLoadingData(false)
    }
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    loadTableData(selectedTable, 1, searchQuery)
  }

  const handleTableSelect = (name: string) => {
    setSelectedTable(name)
    setPage(1)
    setSearchQuery('')
    setSelectedRow(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-800 to-teal-900 text-white p-6 rounded-2xl shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Database className="w-6 h-6 text-emerald-400" />
            <h2 className="text-xl font-bold">SQLite Database Explorer</h2>
          </div>
          <p className="text-emerald-100 text-sm mt-1">
            Live inspection of all tables and schemas inside <code className="bg-emerald-950 px-2 py-0.5 rounded text-emerald-300 font-mono text-xs">sqlite.db</code>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              loadTables()
              if (selectedTable) loadTableData(selectedTable, page, searchQuery)
            }}
            className="flex items-center gap-1.5 bg-emerald-700/60 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-medium transition shadow-sm border border-emerald-600/40"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Table Selector Sidebar */}
        <div className="lg:col-span-1 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 px-2 flex items-center justify-between">
            <span>Database Tables ({tables.length})</span>
            {loadingTables && <RefreshCw className="w-3 h-3 animate-spin text-emerald-600" />}
          </h3>

          <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
            {tables.map((t) => (
              <button
                key={t.name}
                onClick={() => handleTableSelect(t.name)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  selectedTable === t.name
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <TableIcon className={`w-3.5 h-3.5 flex-shrink-0 ${selectedTable === t.name ? 'text-white' : 'text-gray-400'}`} />
                  <span className="truncate">{t.name}</span>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                    selectedTable === t.name
                      ? 'bg-emerald-800 text-emerald-100'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {t.rowCount}
                </span>
              </button>
            ))}
          </div>

          {/* Drizzle Studio Helper Box */}
          <div className="mt-6 p-3.5 bg-amber-50 border border-amber-200/80 rounded-xl text-amber-900 text-xs space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-amber-800">
              <Terminal className="w-4 h-4 text-amber-600" />
              <span>Drizzle Studio Web GUI</span>
            </div>
            <p className="text-[11px] text-amber-700 leading-relaxed">
              For visual schema migration or relational edits, run in terminal:
            </p>
            <code className="block bg-amber-100 text-amber-950 px-2 py-1.5 rounded font-mono text-[11px] border border-amber-200">
              npm run db:studio
            </code>
          </div>
        </div>

        {/* Table Content & Schema Inspector */}
        <div className="lg:col-span-3 space-y-4">
          {/* Controls Bar */}
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900 font-mono bg-gray-100 px-3 py-1 rounded-lg border border-gray-200">
                {selectedTable || 'Select Table'}
              </span>

              {/* Subtabs: Data vs Schema */}
              <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-semibold">
                <button
                  onClick={() => setActiveSubTab('data')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    activeSubTab === 'data'
                      ? 'bg-white text-emerald-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Data Rows ({totalCount})
                </button>
                <button
                  onClick={() => setActiveSubTab('schema')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    activeSubTab === 'schema'
                      ? 'bg-white text-emerald-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Schema ({columns.length} columns)
                </button>
              </div>
            </div>

            {/* Search Bar */}
            {activeSubTab === 'data' && (
              <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={`Search in ${selectedTable}...`}
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-medium transition"
                >
                  Search
                </button>
              </form>
            )}
          </div>

          {/* Subtab: Data View */}
          {activeSubTab === 'data' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {loadingData ? (
                <div className="p-12 text-center text-gray-400">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-600 mb-2" />
                  <p className="text-xs font-semibold">Fetching table rows from sqlite.db...</p>
                </div>
              ) : rows.length === 0 ? (
                <div className="p-12 text-center text-gray-400 space-y-2">
                  <Info className="w-8 h-8 mx-auto text-gray-300" />
                  <p className="text-sm font-semibold text-gray-600">No records found</p>
                  <p className="text-xs text-gray-400">This table is empty or no rows match your search query.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                        <th className="py-3 px-4 w-12 text-center">View</th>
                        {columns.map((col) => (
                          <th key={col.name} className="py-3 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              {col.pk === 1 && <Key className="w-3 h-3 text-amber-500" />}
                              <span>{col.name}</span>
                              <span className="text-[9px] text-gray-400 font-normal font-mono">({col.type})</span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-xs text-gray-700">
                      {rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/80 transition-colors">
                          <td className="py-2.5 px-4 text-center">
                            <button
                              onClick={() => setSelectedRow(row)}
                              title="Inspect JSON Row"
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </td>
                          {columns.map((col) => {
                            const val = row[col.name]
                            let displayVal = val
                            if (val === null || val === undefined) {
                              displayVal = <span className="text-gray-300 font-mono text-[10px] italic">null</span>
                            } else if (typeof val === 'object') {
                              displayVal = <span className="font-mono text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{JSON.stringify(val).slice(0, 30)}...</span>
                            } else if (typeof val === 'string' && val.length > 40) {
                              displayVal = `${val.slice(0, 40)}...`
                            }
                            return (
                              <td key={col.name} className="py-2.5 px-4 whitespace-nowrap font-mono text-[11px]">
                                {displayVal}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="p-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
                  <span>
                    Showing page <b>{page}</b> of <b>{totalPages}</b> ({totalCount} total rows)
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(p - 1, 1))}
                      className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-40"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                      className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-40"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Subtab: Schema Inspector */}
          {activeSubTab === 'schema' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600" />
                Table Column Schema for <code className="font-mono text-emerald-700">{selectedTable}</code>
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 px-4">CID</th>
                      <th className="py-2.5 px-4">Column Name</th>
                      <th className="py-2.5 px-4">Data Type</th>
                      <th className="py-2.5 px-4">Primary Key</th>
                      <th className="py-2.5 px-4">Not Null</th>
                      <th className="py-2.5 px-4">Default Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-mono">
                    {columns.map((c) => (
                      <tr key={c.cid} className="hover:bg-gray-50">
                        <td className="py-2.5 px-4 text-gray-400">{c.cid}</td>
                        <td className="py-2.5 px-4 font-bold text-gray-800">{c.name}</td>
                        <td className="py-2.5 px-4 text-emerald-700">{c.type}</td>
                        <td className="py-2.5 px-4">
                          {c.pk === 1 ? (
                            <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[10px] font-bold">YES</span>
                          ) : (
                            <span className="text-gray-300">NO</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          {c.notnull === 1 ? (
                            <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded text-[10px]">NOT NULL</span>
                          ) : (
                            <span className="text-gray-400">NULLABLE</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-gray-500">{c.dflt_value ?? <span className="text-gray-300 italic">none</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row JSON Inspector Modal */}
      {selectedRow && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 bg-gray-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Code className="w-4 h-4 text-emerald-400" />
                <span>Row Inspection — {selectedTable}</span>
              </div>
              <button
                onClick={() => setSelectedRow(null)}
                className="text-gray-400 hover:text-white text-sm px-2 py-1 rounded-lg hover:bg-gray-800"
              >
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto bg-gray-950 font-mono text-xs text-emerald-400 flex-1">
              <pre>{JSON.stringify(selectedRow, null, 2)}</pre>
            </div>

            <div className="p-3 bg-gray-900 border-t border-gray-800 flex justify-end">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(selectedRow, null, 2))
                  toast.success('Copied JSON row to clipboard!')
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-xl text-xs font-semibold transition"
              >
                Copy JSON
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
