export const FIND_MEDIA_NAME = `
	query ($type: MediaType, $query: String, $genreNotIn: [String]) {
		Page(perPage: 12) {
			pageInfo {
				total
				currentPage
				lastPage
				hasNextPage
				perPage
			}
			media(type: $type, search: $query, genre_not_in: $genreNotIn) {
				id
				title {
					native
					romaji
					english
				}
				synonyms
			}
		}
	}
`;
