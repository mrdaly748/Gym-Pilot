import { Skeleton } from "@/components/ui/Skeleton";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";

/**
 * Shown while Attendance's parallel fetches (members, paginated check-ins,
 * monthly metrics) resolve. Mirrors PageHeader + the two-stat grid + the
 * "Check a member in" form + the check-ins table's real columns +
 * pagination.
 */
export default function Loading() {
  return (
    <main className="p-6 md:p-8">
      <div className="mb-6">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="mt-2 h-7 w-36" />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>

      <div className="mt-8 max-w-sm">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="mt-3 h-56" />
      </div>

      <div className="mt-8">
        <Skeleton className="h-3 w-32" />
        <div className="mt-3">
          <Table>
            <Thead>
              <tr>
                <Th>Member</Th>
                <Th>Membership status</Th>
                <Th>Checked in</Th>
                <Th>Recorded by</Th>
                <Th>Action</Th>
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
                    <Skeleton className="h-4 w-32" />
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
