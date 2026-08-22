import { Skeleton } from "@/components/ui/Skeleton";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";

/**
 * Shown while Memberships' parallel fetches (memberships, members, plans)
 * resolve. Mirrors PageHeader + the "Assign a membership" form + the
 * memberships table's real columns.
 */
export default function Loading() {
  return (
    <main className="p-6 md:p-8">
      <div className="mb-6">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="mt-2 h-7 w-40" />
      </div>

      <div className="mt-6 max-w-sm">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-3 h-40" />
      </div>

      <div className="mt-8">
        <Skeleton className="h-3 w-32" />
        <div className="mt-3">
          <Table>
            <Thead>
              <tr>
                <Th>Member</Th>
                <Th>Plan</Th>
                <Th>Start</Th>
                <Th>End</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </Thead>
            <tbody>
              {Array.from({ length: 4 }).map((_, i) => (
                <Tr key={i}>
                  <Td>
                    <Skeleton className="h-4 w-24" />
                  </Td>
                  <Td>
                    <Skeleton className="h-4 w-20" />
                  </Td>
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
                    <Skeleton className="h-4 w-24" />
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
