// The built-in examples (the "Example Models" project), bundled at build time
// straight from examples/, so no directory listing is needed (adding one
// means rebuilding).
import * as M from './model'

const files = import.meta.glob<unknown>('../../examples/*.json', { eager: true, import: 'default' })

export const exampleTestCases = () => Object.keys(files).sort()
  .map(path => M.fromJSON(JSON.stringify(files[path])))
