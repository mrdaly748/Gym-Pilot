import { Skeleton } from "@/components/ui/Skeleton";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";

/**
 * Shown while Gym Staff's list query resolves. Mirrors PageHeader + the
 * "Add staff" form + the staff table's real columns.
 */
export default function Loading() {
  return (
    <main className="p-6 md:p-8">
      <div className="mb-6">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="mt-2 h-7 w-28" />
      </div>

      <div className="mt-6 max-w-sm">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-3 h-28" />
      </div>

      <div className="mt-8">
        <Skeleton className="h-3 w-24" />
        <div className="mt-3">
          <Table>
            <Thead>
              <tr>
                <Th>Email</Th>
                <Th>Status</Th>
                <Th>Action</Th>
              </tr>
            </Thead>
            <tbody>
              {Array.from({ length: 4 }).map((_, i) => (
                <Tr key={i}>
                  <Td>
                    <Skeleton className="h-4 w-40" />
                  </Td>
                  <Td>
                    <Skeleton className="h-4 w-14" />
                  </Td>
                  <Td>
                    <Skeleton className="h-4 w-16" />
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
