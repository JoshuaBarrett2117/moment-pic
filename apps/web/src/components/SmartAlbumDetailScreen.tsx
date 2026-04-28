import React, { useEffect } from 'react';
import { ArrowLeft, Layers3, Sparkles } from 'lucide-react';
import { useSmartAlbums } from '../hooks';
import { ThrottledImage } from './ThrottledImage';

interface SmartAlbumDetailScreenProps {
  smartAlbumId: string;
  onBack: () => void;
  onNavigateToAlbum: (albumId: string) => void;
}

export const SmartAlbumDetailScreen: React.FC<SmartAlbumDetailScreenProps> = ({ smartAlbumId, onBack, onNavigateToAlbum }) => {
  const { smartAlbumDetail, smartAlbumMembers, isLoading, error, fetchSmartAlbumDetail } = useSmartAlbums();

  useEffect(() => {
    void fetchSmartAlbumDetail(smartAlbumId);
  }, [fetchSmartAlbumDetail, smartAlbumId]);

  return (
    <div className="h-[100dvh] overflow-y-auto bg-surface px-4 py-6 md:px-10 md:py-10">
      <button
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-2 rounded-full bg-surface-container-high px-4 py-2 text-sm font-semibold text-on-surface"
      >
        <ArrowLeft className="h-4 w-4" />
        返回自动整理
      </button>

      {error && (
        <div className="rounded-2xl bg-error-container px-4 py-3 text-sm text-on-error-container">
          {error}
        </div>
      )}

      {isLoading && !smartAlbumDetail ? (
        <div className="py-20 text-center text-outline">正在加载自动整理...</div>
      ) : smartAlbumDetail ? (
        <>
          <div className="mb-8 rounded-[2rem] bg-surface-container-highest p-6 shadow-lg">
            <div className="flex flex-col gap-6 md:flex-row md:items-center">
              <div className="w-full max-w-xs overflow-hidden rounded-[1.5rem] bg-surface-container-high">
                {smartAlbumDetail.coverUrl ? (
                  <ThrottledImage className="aspect-square w-full object-cover" src={smartAlbumDetail.coverUrl} alt={smartAlbumDetail.name} />
                ) : (
                  <div className="flex aspect-square items-center justify-center">
                    <Layers3 className="h-16 w-16 text-outline/20" />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary-container px-4 py-2 text-sm font-semibold text-on-primary-container">
                  <Sparkles className="h-4 w-4" />
                  自动整理
                </div>
                <h1 className="text-3xl font-black text-on-surface md:text-5xl">{smartAlbumDetail.name}</h1>
                <p className="mt-3 text-sm text-outline md:text-base">
                  共收纳 {smartAlbumDetail.albumCount} 个普通图集，累计 {smartAlbumDetail.assetCount} 张图片
                </p>
                {smartAlbumDetail.sourceSummary && (
                  <p className="mt-3 text-sm text-outline/80">命中摘要：{smartAlbumDetail.sourceSummary}</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(smartAlbumMembers || []).map((member) => (
              <button
                key={member.albumId}
                onClick={() => onNavigateToAlbum(member.albumId)}
                className="rounded-2xl bg-surface-container-highest p-4 text-left shadow-md transition-all hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="mb-4 overflow-hidden rounded-xl bg-surface-container-high">
                  {member.coverUrl ? (
                    <ThrottledImage className="aspect-[4/3] w-full object-cover" src={member.coverUrl} alt={member.name} />
                  ) : (
                    <div className="flex aspect-[4/3] items-center justify-center text-outline/30">暂无封面</div>
                  )}
                </div>
                <h3 className="truncate text-lg font-bold text-on-surface" title={member.name}>
                  {member.name}
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-outline">
                  <span>{member.assetCount} 张</span>
                  <span>·</span>
                  <span>{member.sourceType === 'folder' ? '文件夹' : '压缩包'}</span>
                  <span>·</span>
                  <span>{member.sourceEngine === 'rule' ? '规则命中' : member.sourceEngine === 'ai' ? 'AI 命中' : '人工整理'}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="py-20 text-center text-outline">未找到该自动整理</div>
      )}
    </div>
  );
};
