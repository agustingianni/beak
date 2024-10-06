import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { ChromaClient, Collection, IEmbeddingFunction } from 'chromadb';
import { createHash } from 'crypto';

class Embedder implements IEmbeddingFunction {
  constructor(private embedder: OllamaEmbeddings) {}

  async generate(element: string | string[]) {
    const elements = Array.isArray(element) ? element : [element];
    return await this.embedder.embedDocuments(elements);
  }
}

export interface Embeddable {
  id: string | number;
  [key: string]: string | number;
}

export type Query = Omit<Embeddable, 'id'>;

export class VectorRepository {
  constructor(
    private embedder: Embedder,
    private collection: Collection,
    public name: string
  ) {}

  async count(): Promise<number> {
    return await this.collection.count();
  }

  async empty(): Promise<boolean> {
    return (await this.count()) === 0;
  }

  async query(query: Query, nResults = 32) {
    const embedding = await this.embed(query);
    const res = await this.collection.query({
      queryEmbeddings: [embedding],
      nResults
    });

    const { ids, distances } = res;

    return ids[0]!.map((id, index) => ({
      id,
      distance: distances && distances[0] ? distances[0][index] : null
    }));
  }

  private async embed(element: Omit<Embeddable, 'id'>): Promise<number[]> {
    const { id, ...rest } = element;

    // Convert the values of the object to strings
    const values = Object.values(rest).map(String);

    // Generate embeddings for the values
    const embeddings = await this.embedder.generate(values);

    // Sum up the embeddings
    const embedding = embeddings.reduce((acc, emb) => {
      if (!acc.length) {
        return [...emb];
      }
      return acc.map((num, idx) => num + emb[idx]!);
    }, []);

    return embedding;
  }

  async insert(element: Embeddable | Embeddable[]): Promise<void> {
    const elements = Array.isArray(element) ? element : [element];
    const ids: string[] = [];
    const embeddings: number[][] = [];
    const documents: string[] = [];

    for (const element of elements) {
      ids.push(element.id.toString());
      documents.push(JSON.stringify(element));
      embeddings.push(await this.embed(element));
    }

    await this.collection.add({ ids, embeddings, documents });
  }

  async delete(id: string | string[]): Promise<void> {
    const ids = Array.isArray(id) ? id : [id];
    await this.collection.delete({ ids });
  }
}

export class VectorDataSource {
  chroma: ChromaClient;
  embedder: Embedder;

  constructor() {
    this.chroma = new ChromaClient({ path: 'http://localhost:8000' });
    this.embedder = new Embedder(
      new OllamaEmbeddings({
        model: 'nomic-embed-text',
        baseUrl: 'http://localhost:11434'
      })
    );
  }

  async listRepositories(): Promise<string[]> {
    const collections = await this.chroma.listCollections();
    return collections.map(({ name }) => name);
  }

  async getRepository(name: string) {
    const collection = await this.chroma.getOrCreateCollection({
      name: createHash('sha256').update(name).digest('hex').slice(0, 8),
      embeddingFunction: this.embedder,
      metadata: {
        'hnsw:space': 'cosine'
      }
    });

    return new VectorRepository(this.embedder, collection, name);
  }

  async deleteRepository(name: string) {
    await this.chroma.deleteCollection({
      name: createHash('sha256').update(name).digest('hex').slice(0, 8)
    });
  }
}
