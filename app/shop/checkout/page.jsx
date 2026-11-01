import Link from "next/link";

export default function CheckoutPreview() {
  return (
    <main className="checkout-preview">
      <div className="checkout-preview-card">
        <span className="checkout-preview-kicker">CHUCKS SHOPPING MALL / CHECKOUT</span>
        <div className="checkout-preview-mark">✳</div>
        <h1>Almost <em>there.</em></h1>
        <p>The checkout experience is coming next. This is a frontend prototype, so no order has been placed and no payment will be collected.</p>
        <Link className="button primary" href="/shop">Back to shopping <span aria-hidden="true">↗</span></Link>
        <small>YOUR NEXT FAVOURITE PLACE · LOKOJA, NIGERIA</small>
      </div>
    </main>
  );
}
