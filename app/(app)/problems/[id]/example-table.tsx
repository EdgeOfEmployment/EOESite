import type { Signature, TestCase } from '@/lib/problems/types'

const cellClass = 'border border-gray-200 px-2 py-1 font-mono break-all dark:border-gray-800'

export function ExampleTable({ signature, cases }: { signature: Signature; cases: TestCase[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-50 text-left dark:bg-gray-900">
            {signature.params.map((param) => (
              <th key={param.name} className={cellClass}>
                {param.name}
              </th>
            ))}
            <th className={cellClass}>return</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((testCase, row) => (
            <tr key={row}>
              {testCase.args.map((arg, i) => (
                <td key={i} className={cellClass}>
                  {JSON.stringify(arg)}
                </td>
              ))}
              <td className={cellClass}>{JSON.stringify(testCase.expected)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
