import { Skeleton } from "@/components/ui/Skeleton";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";

/**
 * Shown while Trainers' parallel fetches (trainers, members, and each
 * trainer's assigned members) resolve. Mirrors PageHeader + the
 * "Add a trainer" form + the trainers table's real columns.
 */
export default function Loading() {
  return (
    <main className="p-6 md:p-8">
      <div className="mb-6">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="mt-2 h-7 w-32" />
      </div>

      <div className="mt-6 max-w-sm">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-64" />
      </div>

      <div className="mt-8">
        <Skeleton className="h-3 w-24" />
        <div className="mt-3">
          <Table>
            <Thead>
              <tr>
                <Th>Name</Th>
                <Th>Contact</Th>
                <Th>Status</Th>
                <Th>Assigned members</Th>
                <Th>Action</Th>
              </tr>
            </Thead>
            <tbody>
              {Array.from({ length: 4 }).map((_, i) => (
                <Tr key={i}>
                  <Td>
                    <Skeleton className="h-4 w-28" />
                  </Td>
                  <Td>
                    <Skeleton className="h-4 w-24" />
                  </Td>
                  <Td>
                    <Skeleton className="h-4 w-14" />
                  </Td>
                  <Td>
                    <Skeleton className="h-4 w-36" />
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
