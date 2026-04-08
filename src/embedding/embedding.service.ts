import { HfInference } from '@huggingface/inference'
import { Injectable } from '@nestjs/common'

@Injectable()
export class EmbeddingService {
  private readonly hf: HfInference
  private readonly model = 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'

  constructor() {
    this.hf = new HfInference(process.env.HF_API_TOKEN)
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.hf.featureExtraction({
      model: this.model,
      inputs: text,
    })
    return Array.from(result as number[])
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // HF featureExtraction은 배열 입력 시 2D 배열 반환
    const result = await this.hf.featureExtraction({
      model: this.model,
      inputs: texts,
    })
    const raw = result as number[][] | number[]
    // 단일 텍스트면 1D → 2D로 래핑
    if (texts.length === 1) {
      return [Array.from(raw as number[])]
    }
    return (raw as number[][]).map((v) => Array.from(v))
  }
}
