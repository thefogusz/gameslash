import { gamePlatformBadges } from "@/lib/game-platforms";
import { gamePlatforms, gameStatusTags, isGameStatus } from "@/lib/game-tags";

export function GameMetadata({ tags, compact = false }: { tags: string[]; compact?: boolean }) {
  if (compact) {
    const platforms = gamePlatformBadges(tags);
    return platforms.length ? <div className="game-platform-badges" aria-label="แพลตฟอร์มที่ยืนยันแล้ว">
      {platforms.map(group => <span key={group.value} title={group.description}>{group.label}</span>)}
    </div> : null;
  }
  const statuses = tags.filter(isGameStatus);
  const platforms = tags.filter(tag => gamePlatforms.includes(tag));
  const genres = tags.filter(tag => !isGameStatus(tag) && !gamePlatforms.includes(tag));
  return <div className={`game-metadata${compact ? " compact" : ""}`}>
    {statuses.length > 0 && <div className="game-meta-row"><span className="game-meta-label">สถานะ</span><div className="game-meta-values">{statuses.map(name => <span className="game-status" key={name} title={gameStatusTags.find(t => t.name === name)?.thai}>{name}<span>{gameStatusTags.find(t => t.name === name)?.thai}</span></span>)}</div></div>}
    {platforms.length > 0 && <div className="game-meta-row"><span className="game-meta-label">แพลตฟอร์ม</span><div className="game-meta-values">{platforms.map(name => <span className="game-platform" key={name}>{name}</span>)}</div></div>}
    {!compact && genres.length > 0 && <div className="game-meta-row"><span className="game-meta-label">ลักษณะเกม</span><div className="tags">{genres.map(name => <span key={name}>{name}</span>)}</div></div>}
  </div>;
}

