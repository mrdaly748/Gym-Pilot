import { Skeleton } from "@/components/ui/Skeleton";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";

/**
 * Shown while Expenses' list query resolves. Mirrors PageHeader + the
 * "Record an expense" form + the expenses table's real columns.
 */
export default function Loading() {
  return (
    <main className="p-6 md:p-8">
      <div className="mb-6">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="mt-2 h-7 w-32" />
      </div>

      <div className="mt-6 max-w-sm">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-3 h-64" />
      </div>

      <div className="mt-8">
        <Skeleton className="h-3 w-24" />
        <div className="mt-3">
          <Table>
            <Thead>
              <tr>
                <Th>Date</Th>
                <Th>Category</Th>
                <Th>Amount</Th>
                <Th>Effective</Th>
                <Th>Recorded by</Th>
                <Th>Action</Th>
              </tr>
            </Thead>
            <tbody>
              {Array.from({ length: 4 }).map((_, i) => (
                <Tr key={i}>
                  <Td>
                    <Skeleton className="h-4 w-20" />
                  </Td>
                  <Td>
                    <Skeleton className="h-4 w-20" />
                  </Td>
                  <Td>
                    <Skeleton className="h-4 w-16" />
                  </Td>
                  <Td>
                    <Skeleton className="h-4 w-16" />
                  </Td>
                  <Td>
                    <Skeleton className="h-4 w-28" />
                  </Td>
                  <Td>
                    <Skeleton className="h-4 w-20" />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      </div>
    </main>
  );
}
