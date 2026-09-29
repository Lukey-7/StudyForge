# Computer Networks — Revision Notes

These notes were written for the StudyForge evaluation set and cover layering, TCP, congestion
control, routing, DNS and HTTP.

## 1. Layered Architecture

Networks are designed in layers so each layer offers services to the layer above and hides the
details of the layers below. The TCP/IP model has an application layer, a transport layer, a
network layer and a link layer. The OSI reference model has seven layers: physical, data link,
network, transport, session, presentation and application.

When data moves down the stack, each layer adds its own header, a process called encapsulation:
application data becomes a segment at the transport layer, a packet (datagram) at the network
layer and a frame at the link layer.

## 2. Transport Layer: UDP and TCP

UDP is a connectionless protocol with an 8-byte header. It provides multiplexing through port
numbers and an optional checksum but no reliability, ordering or congestion control, which makes it
suitable for DNS queries, streaming media and online games where low latency matters more than
retransmitting lost data.

TCP is connection-oriented and provides a reliable, ordered byte stream. A connection is opened with
a three-way handshake: the client sends SYN, the server replies with SYN-ACK, and the client
responds with ACK. Each side chooses a random initial sequence number to protect against old
duplicate segments and spoofing. The connection is closed with FIN segments from both sides, and
the side that closes first waits in the TIME_WAIT state for twice the maximum segment lifetime.

TCP achieves reliability with sequence numbers, cumulative acknowledgements, checksums and
retransmission. The retransmission timeout is computed from a smoothed estimate of the round-trip
time plus four times its variation. Fast retransmit resends a segment after three duplicate ACKs
without waiting for the timeout.

Flow control prevents the sender from overflowing the receiver's buffer: the receiver advertises a
receive window (rwnd) in every ACK, and the sender never has more unacknowledged data in flight than
that window allows.

## 3. Congestion Control

Congestion control protects the network rather than the receiver. The sender keeps a congestion
window (cwnd) and may send at most min(cwnd, rwnd) unacknowledged bytes.

In slow start, cwnd begins at a small value and doubles every round-trip time, growing exponentially
until it reaches the slow-start threshold (ssthresh). After that, congestion avoidance increases
cwnd by about one maximum segment size per round trip, which is linear growth. This combination of
additive increase and multiplicative decrease is called AIMD.

When loss is detected by three duplicate ACKs, TCP Reno halves cwnd and enters fast recovery. When
loss is detected by a timeout, the situation is considered more serious: ssthresh is set to half of
cwnd and cwnd is reset to one segment, restarting slow start. TCP CUBIC, the default in Linux, grows
the window as a cubic function of time since the last loss, which scales better on high-bandwidth,
long-delay paths. Google's BBR estimates bottleneck bandwidth and round-trip propagation time instead
of reacting to loss.

## 4. Network Layer and Routing

IPv4 addresses are 32 bits long and IPv6 addresses are 128 bits long. CIDR notation such as
192.168.1.0/24 means the first 24 bits are the network prefix, leaving 8 bits for 256 addresses in
the block. Routers forward packets using longest-prefix matching: when several routing-table entries
match a destination, the most specific prefix wins.

Network Address Translation (NAT) lets many devices on a private network share one public IP address
by rewriting source addresses and ports, which slowed the exhaustion of IPv4 addresses but breaks the
end-to-end principle.

Link-state routing, used by OSPF, floods information about every link to all routers so that each
router builds a complete map and runs Dijkstra's shortest-path algorithm. Distance-vector routing,
used by RIP, has each router share its distance table only with neighbours and applies the
Bellman-Ford equation; it converges slowly and suffers from the count-to-infinity problem, which is
mitigated by split horizon and poisoned reverse. BGP is the path-vector protocol that routes between
autonomous systems on the Internet and chooses routes by policy rather than shortest distance.

## 5. DNS

The Domain Name System translates human-readable names into IP addresses. It is a distributed,
hierarchical database: root servers point to top-level-domain servers such as .com, which point to
the authoritative servers for each domain. A stub resolver usually sends a recursive query to a local
resolver, and that resolver performs iterative queries against the root, TLD and authoritative
servers on its behalf. Answers are cached for the time-to-live (TTL) set on each record. Common record
types are A (IPv4 address), AAAA (IPv6 address), CNAME (alias), MX (mail server) and NS (name server).
DNS normally uses UDP port 53 and falls back to TCP for large responses and zone transfers.

## 6. HTTP

HTTP is a stateless request-response protocol; cookies are used to add state such as login sessions.
HTTP/1.1 introduced persistent connections so several requests can reuse one TCP connection, but
responses on a connection still suffer from head-of-line blocking. HTTP/2 multiplexes many streams
over one connection using binary frames and compresses headers with HPACK. HTTP/3 runs over QUIC, a
transport built on UDP that removes TCP-level head-of-line blocking and combines the transport and
TLS 1.3 handshakes to reduce connection setup latency.

Status codes are grouped by their first digit: 2xx success, 3xx redirection, 4xx client errors such
as 404 Not Found, and 5xx server errors such as 503 Service Unavailable. GET, PUT and DELETE are
idempotent, meaning repeating the request has the same effect as sending it once, while POST is not.
