import os
import time
from typing import List

import click
import humanize
import torch
from sentence_transformers import SentenceTransformer, util
from sklearn.cluster import AgglomerativeClustering


def read_lines_from_file(file_path: str) -> List[str]:
    """Reads a file line by line and returns a list of strings."""
    with open(file_path, "r") as file:
        return [line.strip() for line in file]


@click.group()
def embeddings():
    """CLI tool to handle embeddings with query and clustering operations."""
    pass


@embeddings.command()
@click.argument("input", type=click.Path(exists=True))
def generate(input):
    """Generate embeddings from a log file and save them to an output file."""
    output = os.path.join(
        os.path.dirname(input), os.path.basename(input).rsplit(".", 1)[0] + ".pth"
    )
    click.echo(f"Generating embeddings from {input} and saving to {output}")

    # Load and initialize the model
    model = SentenceTransformer("all-mpnet-base-v2")

    # Read and process the input file
    start = time.time()
    corpus_sentences = read_lines_from_file(input)
    corpus_embeddings = model.encode(corpus_sentences, convert_to_tensor=True)
    end = time.time()

    # Logging time and size
    encoding_time = humanize.naturaldelta(end - start)
    embeddings_size = humanize.naturalsize(
        corpus_embeddings.element_size() * corpus_embeddings.nelement(), binary=True
    )

    # Provide detailed information about input and output
    click.echo(f"Input corpus contains {len(corpus_sentences)} sentences.")
    click.echo(f"Encoding took {encoding_time}.")
    click.echo(f"Total embeddings size is {embeddings_size}.")

    # Optionally save embeddings to a file using torch
    torch.save(corpus_embeddings, output)
    click.echo(f"Embeddings saved to {output}.")


@embeddings.command()
@click.argument("input", type=click.Path(exists=True))
@click.argument("embeddings", type=click.Path(exists=True))
def clusters(input, embeddings):
    """Generate clusters from the specified input file."""
    click.echo(f"Generating clusters from {input}")

    # Load the corpus and embeddings
    corpus_sentences = read_lines_from_file(input)
    corpus_embeddings = torch.load(embeddings, map_location=torch.device("cpu"))

    # Perform agglomerative clustering
    clustering_model = AgglomerativeClustering(n_clusters=None, distance_threshold=1.5)
    clustering_model.fit(corpus_embeddings)
    cluster_assignment = clustering_model.labels_

    clustered_sentences = {}
    for sentence_id, cluster_id in enumerate(cluster_assignment):
        if cluster_id not in clustered_sentences:
            clustered_sentences[cluster_id] = []

        clustered_sentences[cluster_id].append(corpus_sentences[sentence_id])

    # Display clustered results neatly
    click.echo("\nGenerated Clusters:")
    for i, cluster in clustered_sentences.items():
        click.echo(f"\nCluster {i + 1}:")
        for sentence in cluster:
            click.echo(f" - {sentence}")
        click.echo("")


@embeddings.command()
@click.argument("input", type=click.Path(exists=True))
@click.argument("embeddings", type=click.Path(exists=True))
@click.argument("query", nargs=-1)
def query(input, embeddings, query):
    """
    Perform a query on embeddings.

    https://www.mixedbread.ai/blog/mxbai-embed-large-v1
    https://github.com/UKPLab/sentence-transformers/blob/master/examples/applications/semantic-search/README.md
    https://ollama.com/library/mxbai-embed-large
    https://ollama.com/library/nomic-embed-text
    """
    # Combine the query words into a full query string
    query = " ".join(query)
    click.echo(f"Querying embeddings in {embeddings} with: '{query}'")

    # Load the corpus and embeddings
    corpus_sentences = read_lines_from_file(input)
    corpus_embeddings = torch.load(embeddings, map_location=torch.device("cpu"))

    # Create the embedding for the query.
    model = SentenceTransformer("all-mpnet-base-v2")
    query_embedding = model.encode(query, convert_to_tensor=True)

    # Perform the search.
    start = time.time()
    hits = util.semantic_search(query_embedding, corpus_embeddings)
    hits = hits[0]
    end = time.time()

    # Display results
    click.echo(f"\nInput query: '{query}'")
    click.echo(f"Search took {humanize.naturaldelta(end - start)}")
    click.echo("\nTop matches:")
    for hit in hits:
        score = hit["score"]
        corpus_id = hit["corpus_id"]
        click.echo(f"\tScore: {score:.3f}\tSentence: {corpus_sentences[corpus_id]}")
    click.echo("\n==============================\n")


@embeddings.command()
@click.argument("model")
def test(model):
    SentenceTransformer(model)


if __name__ == "__main__":
    embeddings()
