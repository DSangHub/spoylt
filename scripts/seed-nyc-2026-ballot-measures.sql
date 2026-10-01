-- NYC local ballot proposals, November 3, 2026.
-- Source checked October 1, 2026. Short titles and summaries are neutral paraphrases.
-- Each proposal covers all five NYC counties; county rows support geographic selection.
insert into public.ballot_measures
(id, election_date, state_code, county_name, jurisdiction, scope, measure_number, title, summary, source_url, official, active)
select 'nyc-2026-11-03-' || lower(replace(c.county_name, ' ', '-')) || '-' || m.measure_number,
 date '2026-11-03', 'NY', c.county_name, 'New York City', 'county',
 m.measure_number, m.title, m.summary,
 'https://www.nycvotes.org/whats-on-the-ballot/2026-ballot-proposals/', true, true
from (values ('Bronx'), ('Kings'), ('New York'), ('Queens'), ('Richmond')) as c(county_name)
cross join (values
 ('1', 'Public-space permit review', 'Changes the review process for permissions to use public streets and sidewalks, including sidewalk cafes.'),
 ('2', 'City contracting paperwork and procurement meetings', 'Changes contractor questionnaires and contracting approvals, and requires quarterly Procurement Policy Board meetings.'),
 ('3', 'Street projects, unused city property, and office leasing', 'Changes reviews for street-safety projects, disposition of certain city property, and city workforce office leases.'),
 ('4', 'Building and waterfront permitting', 'Creates a centralized construction-permit hub and transfers waterfront permitting to the Department of Buildings.'),
 ('5', 'Rainy-day fund savings targets', 'Sets reserve targets and requires a methodology for contributions to city financial reserves.')
) as m(measure_number, title, summary)
on conflict (id) do update set
 election_date = excluded.election_date, state_code = excluded.state_code,
 county_name = excluded.county_name, jurisdiction = excluded.jurisdiction,
 scope = excluded.scope, measure_number = excluded.measure_number,
 title = excluded.title, summary = excluded.summary, source_url = excluded.source_url,
 official = excluded.official, active = excluded.active, updated_at = now();
