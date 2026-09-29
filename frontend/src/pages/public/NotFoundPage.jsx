import { Link } from 'react-router-dom'
import PublicPage from '../../landing/PublicPage'

// A wrong address should still lead somewhere useful.
export default function NotFoundPage({ signedIn }) {
  return (
    <PublicPage signedIn={signedIn} title="There is no page here" lede="The address may be mistyped, or the page may have moved.">
      <ul className="link-list">
        <li>
          <Link to="/welcome">Start at the home page</Link>
        </li>
        <li>
          <Link to={signedIn ? '/notebooks' : '/login'}>{signedIn ? 'Open your notebooks' : 'Sign in'}</Link>
        </li>
        <li>
          <Link to="/formats">Browse the sixteen formats</Link>
        </li>
        <li>
          <Link to="/how-it-works">Read how it works</Link>
        </li>
      </ul>
    </PublicPage>
  )
}
