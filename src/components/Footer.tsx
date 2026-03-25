import './footer.css';

export default function Footer() {
  return (
    <footer>
      <div className="footer-content">
        <span>© 2026 <a href="https://janczechowski.com" target="_blank" rel="noopener noreferrer">Jan Czechowski</a></span>
        <span className="footer-divider">|</span>
        <span>Data: <a href="https://iwc.int/management-and-conservation/whaling/total-catches" target="_blank" rel="noopener noreferrer">International Whaling Commision</a></span>
      </div>
    </footer>
  );
}
