# Election surveys

The blue Surveys button opens four races: Texas Governor, Ohio Governor, Ohio U.S. Senate, and Texas U.S. Senate. All four include seven candidate choices (including declared write-ins) and an undecided option. Ohio governor choices include the lieutenant governor ticket. Candidate lists were checked against the linked official certification documents on October 23, 2026.

Definitions and responses are held in the unexposed `survey_private` schema. Browser roles have no direct table access. Public `get_election_surveys` returns candidate definitions, aggregate counts, and only the caller's own choice. `answer_election_survey` requires a confirmed, non-anonymous, unbanned account and validates the choice against the requested open race. A primary key enforces one response per account per race; updating changes the existing response. There is no client supplied user ID. Surveys close November 4, 2026 at 08:00 UTC.

The page explains that selections are linked to accounts, only totals are public, and participation does not verify registration or residence. Results are voluntary survey responses, not scientific polls or official election results. Individual responses must not be exported or displayed publicly.

Schema and seed are in `scripts/election-surveys-schema.sql` and `scripts/seed-election-surveys-2026.sql`. They were applied together as `election_surveys_texas_ohio_2026` to Supabase project `xceamvdvjnutaovqpsbr`. The transaction in `tests/election-surveys-database.sql` verifies complete options, anonymous denial, one response despite repeat submissions, updates, invalid cross-race choices, and privacy; all fixtures are rolled back.
