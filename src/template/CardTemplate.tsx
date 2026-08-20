import type { CardMeta, Page, PageItem, StyleParams } from '@/markdown/types'
import { InlineText } from './InlineText'
import { makeCssVars } from './styleVars'
import { FONT_FAMILIES } from '@/fonts'
import './card.css'

function VerifiedIcon() {
  return (
    <svg
      className="xhs-verified"
      viewBox="0 0 22 22"
      aria-label="verified"
      role="img"
      fill="#1e90ff"
      fillRule="evenodd"
      clipRule="evenodd"
    >
      <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
    </svg>
  )
}

function ItemView({ item, fontFamily }: { item: PageItem; fontFamily: string }) {
  switch (item.kind) {
    case 'heading':
      return (
        <div className="xhs-h" data-level={item.level}>
          <span className="xhs-h-text">
            <InlineText nodes={item.inline} fontFamily={fontFamily} />
          </span>
        </div>
      )
    case 'paragraph':
      return (
        <p className="xhs-p" data-continued={item.continued ? 'true' : 'false'}>
          <InlineText nodes={item.inline} fontFamily={fontFamily} />
        </p>
      )
    case 'image':
      return (
        <img
          className="xhs-img"
          src={item.src}
          alt={item.alt ?? ''}
          data-align={item.align ?? 'center'}
          style={item.width ? { width: `${item.width}%` } : undefined}
        />
      )
    case 'quote':
      return (
        <blockquote className="xhs-quote">
          <InlineText nodes={item.inline} fontFamily={fontFamily} />
        </blockquote>
      )
    case 'list':
      return item.ordered ? (
        <ol className="xhs-list">
          {item.items.map((it, i) => (
            <li key={i}>
              <InlineText nodes={it} fontFamily={fontFamily} />
            </li>
          ))}
        </ol>
      ) : (
        <ul className="xhs-list">
          {item.items.map((it, i) => (
            <li key={i}>
              <InlineText nodes={it} fontFamily={fontFamily} />
            </li>
          ))}
        </ul>
      )
    case 'code':
      if (item.diagram) {
        return (
          <div
            className="xhs-diagram"
            style={{ width: item.diagSize?.w, height: item.diagSize?.h }}
            dangerouslySetInnerHTML={{ __html: item.diagram.html }}
          />
        )
      }
      return (
        <pre
          className="xhs-code"
          data-lang={item.lang}
          style={item.size ? { fontSize: `${item.size}px` } : undefined}
        >
          <code>{item.code}</code>
        </pre>
      )
    case 'divider':
      return <hr className="xhs-divider" />
  }
}

export function CardTemplate({
  page,
  meta,
  style,
}: {
  page: Page
  meta: CardMeta
  style: StyleParams
}) {
  const fontFamily = FONT_FAMILIES[style.font]
  return (
    <div className="xhs-card" style={makeCssVars(style)}>
      <header className="xhs-header">
        <img className="xhs-avatar" src={meta.avatar} alt="" />
        <div className="xhs-header-meta">
          <div className="xhs-username-row">
            <span className="xhs-username">{meta.username}</span>
            {meta.verified && <VerifiedIcon />}
          </div>
          <div className="xhs-sub">
            @{meta.handle}　{meta.date}
          </div>
        </div>
      </header>
      <div className="xhs-content" data-xhs-content>
        {page.items.map((item, i) => (
          <ItemView key={i} item={item} fontFamily={fontFamily} />
        ))}
      </div>
    </div>
  )
}