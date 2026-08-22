import { Skeleton } from "@/components/ui/Skeleton";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";

/**
 * Shown while Payments' parallel fetches (paginated payments, memberships,
 * and — for Gym Admin — the outstanding-balance figure) resolve. Mirrors
 * PageHeader + the outstanding-balance stat + the "Record a payment" form +
 * the payments table's real columns + pagination. The stat card is shown
 * unconditionally here since the role isn't known yet at this point — same
 * "don't try to replicate the role branch" approach as dashboard/loading.tsx.
 */
export default function Loading() {
  return (
    <main className="p-6 md:p-8">
      <div className="mb-6">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="mt-2 h-7 w-32" />
      </div>

      <div className="mb-6 max-w-xs">
        <Skeleton className="h-24" />
      </div>

      <div className="mt-6 max-w-sm">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-3 h-72" />
      </div>

      <div className="mt-8">
        <Skeleton className="h-3 w-24" />
        <div className="mt-3">
          <Table>
            <Thead>
              <tr>
                <Th>Date</Th>
                <Th>Amount</Th>
                <Th>Effective</Th>
                <Th>Method</Th>
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
                    <Skeleton className="h-4 w-16" />
                  </Td>
                  <Td>
                    <Skeleton className="h-4 w-16" />
                  </Td>
                  <Td>
                    <Skeleton className="h-4 w-14" />
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
          <div className="mt-4 flex items-center justify-between">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-16" />
          </div>
        </div>
      </div>
    </main>
  );
}
