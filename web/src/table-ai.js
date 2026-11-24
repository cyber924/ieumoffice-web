// Table-scoped editing: never insert an AI answer as free text beside a table.
const read = node => (node?.innerText ?? node?.textContent ?? '').replace(/\u00a0/g, ' ').trim()
const clean = value => String(value ?? '').trim()
const normalize = value => clean(value).replace(/[\s:：*]+/g, '').toLowerCase()
const isHeader = value => /^(항목|내용|구분|비고|번호|성명|이름)$/.test(normalize(value))

export function captureTableTargets(root, preferredCell = null) {
  const targets = []
  const elements = new Map()
  const tables = Array.from(root.querySelectorAll('table')).slice(0, 15)
  tables.forEach((table, tableIndex) => {
    const rows = Array.from(table.rows).slice(0, 45)
    rows.forEach((row, rowIndex) => {
      const cells = Array.from(row.cells).slice(0, 12)
      const first = read(cells[0])
      const labeled = cells.length === 2 && first.length > 0 && !isHeader(first)
      const header = cells.every(c => c.tagName === 'TH') ||
        (rowIndex === 0 && cells.some(c => isHeader(read(c))))
      cells.forEach((cell, columnIndex) => {
        const selected = preferredCell === cell
        const editable = selected || (!header && (labeled ? columnIndex === 1 : !first && cells.length > 1 ? false : columnIndex > 0 && cells.length > 2 && rowIndex > 0))
        if (!editable) return
        const cellId = `t${tableIndex}r${rowIndex}c${columnIndex}`
        const record = {
          cellId, label: labeled ? first : `표 ${tableIndex + 1} / ${rowIndex + 1}행 ${columnIndex + 1}열`,
          current: read(cell).slice(0, 1000), table: tableIndex + 1,
          row: rowIndex + 1, column: columnIndex + 1,
          editable: true,
        }
        targets.push(record)
        elements.set(cellId, cell)
      })
    })
  })
  return { targets: targets.slice(0, 100), elements }
}

export function validateTableEdits(snapshot, proposals, {overwrite = false} = {}) {
  if (!snapshot || !Array.isArray(proposals)) return []
  const byId = new Map(snapshot.targets.map(item => [item.cellId,item]))
  const valid = []
  const seen = new Set()
  for (const proposed of proposals.slice(0, 100)) {
    const id = clean(proposed?.cellId)
    const original = byId.get(id)
    const element = snapshot.elements.get(id)
    const value = typeof proposed?.value === 'string' ? proposed.value.trim() : ''
    if (!original || !element?.isConnected || seen.has(id) || !value || value.length > 1000) continue
    if (read(element) !== original.current) continue
    if (original.current && !overwrite) continue
    if (value === original.current) continue
    seen.add(id)
    valid.push({ cellId:id, label:original.label, before: original.current, value, element })
  }
  return valid
}

export function applyTableEdits(edits) {
  let applied=0
  for (const edit of edits) {
    if (!edit.element?.isConnected || read(edit.element) !== edit.before) continue
    // Modify only text inside the existing cell. Keep its data-bind and table structure.
    edit.element.textContent = edit.value
    applied++
  }
  return applied
}

export function matchingFormFields(root) {
  const snapshot = captureTableTargets(root)
  return {
    snapshot,
    fields: snapshot.targets.filter(t => t.label && !t.label.startsWith('표 ') && !t.current)
  }
}
