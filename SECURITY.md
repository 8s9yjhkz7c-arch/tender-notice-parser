# Security and privacy

The parser runs locally and does not fetch URLs, execute notice content, or transmit input. The output contains text supplied by the caller, including short evidence excerpts. Treat output as sensitive whenever the notice is sensitive, and render all text as escaped content in any downstream web application.

Use synthetic notices for issues and test cases. Remove customer identifiers, contact details, internal links, and credentials from reproductions. Avoid posting actual notices or production output in public issues. Use the repository's private vulnerability reporting channel when available.

Use the 1 MiB input limit for local calls and enforce a request size limit before accepting uploads in a network service. Set process and request time limits if exposing the parser to untrusted callers. Treat parsed dates as evidence for review before scheduling procurement actions.
