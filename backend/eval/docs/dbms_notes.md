# Database Management Systems — Revision Notes

These notes were written for the StudyForge evaluation set. They summarise core DBMS topics
for a university course.

## 1. The Relational Model

A relation is a table: a set of tuples (rows) that share the same attributes (columns). Each
attribute has a domain, which is the set of values it may take. The relational model was
proposed by Edgar F. Codd in 1970 while he worked at IBM, and it separated the logical view of
data from how the data is physically stored on disk.

A superkey is any set of attributes that uniquely identifies a tuple. A candidate key is a
minimal superkey: remove any attribute and it stops being unique. The primary key is the
candidate key the designer chooses to identify rows. A foreign key is an attribute in one table
that refers to the primary key of another table, and referential integrity requires that every
foreign key value either matches an existing primary key value or is null.

Relational algebra is the procedural foundation of SQL. Selection (sigma) filters rows, projection
(pi) keeps chosen columns, the Cartesian product pairs every row of one relation with every row of
another, and a join is a product followed by a selection. Union, intersection and set difference
require union-compatible relations, meaning the same number of attributes with matching domains.

## 2. Normalization

Normalization organises tables to reduce redundancy and avoid update anomalies. An insertion
anomaly happens when you cannot record one fact without another unrelated fact, a deletion anomaly
happens when deleting one fact accidentally deletes another, and an update anomaly happens when
the same fact is stored in many rows and one copy is changed but the others are not.

First normal form (1NF) requires atomic values: no repeating groups and no lists inside a cell.
Second normal form (2NF) requires 1NF and that every non-key attribute depends on the whole
primary key, which removes partial dependencies; it only matters when the key is composite.
Third normal form (3NF) requires 2NF and no transitive dependencies, meaning a non-key attribute
must not depend on another non-key attribute. A short way to remember 3NF is that every non-key
attribute must depend on "the key, the whole key, and nothing but the key".

Boyce-Codd normal form (BCNF) is stricter than 3NF: for every non-trivial functional dependency
X → Y, X must be a superkey. Every BCNF schema is in 3NF, but a 3NF schema can violate BCNF when
there are overlapping candidate keys. Decomposing to BCNF is always lossless-join but may not
preserve all functional dependencies, which is why designers sometimes stop at 3NF.

Denormalization deliberately reintroduces redundancy, for example storing a customer name inside
an orders table, to avoid expensive joins in read-heavy systems. The price is extra storage and
the risk of inconsistent copies that must be kept in sync by the application or by triggers.

## 3. Indexing

An index is an auxiliary data structure that speeds up lookups on one or more columns, much like
the index at the back of a textbook. Without an index the database must perform a full table scan,
reading every row. Indexes speed up reads but slow down writes, because every insert, update or
delete must also update each index on the table, and they consume extra disk space.

The most common index structure is the B+ tree. It is a balanced tree whose internal nodes hold
only keys for navigation while all records (or pointers to them) live in the leaf nodes, and the
leaves are linked together. Because the tree is balanced and has a high fan-out, a lookup costs
O(log n) page reads, and the linked leaves make range queries such as BETWEEN or ORDER BY cheap.

A hash index applies a hash function to the key and jumps directly to a bucket, giving O(1)
average lookups for equality predicates. Hash indexes cannot answer range queries or help with
sorting, because hashing destroys the order of keys.

A clustered index determines the physical order of rows on disk, so a table can have only one
clustered index. A non-clustered (secondary) index stores keys with pointers to the rows and a
table can have many of them. A covering index contains every column a query needs, so the
database can answer the query from the index alone without visiting the table, which is called an
index-only scan.

For a composite index on (a, b, c), the leftmost-prefix rule applies: the index can serve
queries that filter on a, on a and b, or on a, b and c, but not a query that filters only on b.

## 4. Transactions and ACID

A transaction is a sequence of operations executed as a single logical unit of work. Transactions
guarantee the ACID properties. Atomicity means all operations of a transaction happen or none of
them do; the recovery system uses an undo log to roll back a partial transaction. Consistency means
a transaction moves the database from one valid state to another, respecting all constraints.
Isolation means concurrent transactions do not see each other's intermediate states. Durability
means that once a transaction commits, its changes survive crashes, which is achieved with a
write-ahead log that is flushed to stable storage before the commit is acknowledged.

Write-ahead logging (WAL) is the rule that a log record describing a change must reach disk before
the changed data page itself is written. After a crash, the ARIES recovery algorithm runs three
passes: analysis, redo and undo.

## 5. Concurrency Control

Without concurrency control, interleaved transactions cause anomalies. A dirty read happens when a
transaction reads data written by another transaction that has not committed yet. A non-repeatable
read happens when a transaction reads the same row twice and gets different values because another
transaction committed an update in between. A phantom read happens when a query returns a
different set of rows on re-execution because another transaction inserted or deleted matching rows.

The SQL standard defines four isolation levels. Read Uncommitted allows dirty reads. Read
Committed prevents dirty reads. Repeatable Read also prevents non-repeatable reads. Serializable
prevents phantoms as well and makes the result equivalent to some serial order of the transactions.

Two-phase locking (2PL) guarantees conflict-serializability: in the growing phase a transaction
may acquire locks but not release any, and in the shrinking phase it may release locks but not
acquire new ones. Strict 2PL holds all exclusive locks until commit, which also prevents cascading
aborts. Shared locks allow concurrent readers, while an exclusive lock is required to write.

Multi-version concurrency control (MVCC), used by PostgreSQL, keeps several versions of each row
so that readers never block writers and writers never block readers; each transaction sees a
snapshot of the database as of the moment it started.

A deadlock in a database occurs when two transactions each wait for a lock held by the other.
Databases detect deadlocks by looking for cycles in a waits-for graph and abort one victim
transaction to break the cycle.

## 6. Query Processing

The query optimizer turns SQL into an execution plan. It estimates the cost of alternative plans
using statistics such as table cardinality and column histograms, and picks the cheapest one. Common
join algorithms are the nested-loop join, which is good when one input is small or an index exists
on the inner table; the sort-merge join, which is efficient when both inputs are already sorted on
the join key; and the hash join, which builds a hash table on the smaller input and probes it with
the larger one and is usually the best choice for large unsorted equi-joins.
