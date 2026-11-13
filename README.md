# SolidCraft 3000

**Try it: https://raykholo.github.io/solidcraft3000/**

SolidCraft 3000 is a parody of generic cloud software: a "100% in the cloud" splash, maintenance that never ends, an
update stuck at 99%, sessions that expire, sync conflicts and the odd outage. None of it is real: there is no cloud and
no account, and the CAD underneath is the real [SolidCraft](https://github.com/tangency-labs/solidcraft), free and open
source, running in your browser.

It follows SolidCraft's public releases: every day `.github/workflows/pages.yml` checks for a new
[SolidCraft release](https://github.com/tangency-labs/solidcraft/releases), applies the SolidCraft 3000 change (the
`sc3000` branch of [raykholo/solidcraft](https://github.com/raykholo/solidcraft/tree/sc3000), a default-off `sc3000`
feature) on top of it, and rebuilds the site. The release it runs is in
[sc3000-release.txt](https://raykholo.github.io/solidcraft3000/sc3000-release.txt).
