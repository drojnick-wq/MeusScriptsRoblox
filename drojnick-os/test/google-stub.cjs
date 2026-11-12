// Synthetic provider responses for the API integration test; never used at runtime.
const realFetch = global.fetch;
global.fetch = async (url, options) => {
  if (url === "https://places.googleapis.com/v1/places:searchText") {
    const key = options.headers["X-Goog-Api-Key"];
    if (key !== "synthetic-account-key")
      return new Response("{}", { status: 403 });
    return Response.json({
      places: [
        {
          id: "test-only-place",
          displayName: { text: "Restaurante de teste" },
          formattedAddress: "Endereço sintético",
        },
      ],
      nextPageToken: "test-next-page",
    });
  }
  return realFetch(url, options);
};
